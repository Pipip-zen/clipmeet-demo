import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:3001';
const RTC_CONFIGURATION = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
const MEDIA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: true,
};

function buildPeerLabel(peerId, participantName) {
  return participantName || `Peer ${peerId.slice(0, 6)}`;
}

function normalizePeer(peer) {
  if (typeof peer === 'string') {
    return {
      socketId: peer,
      participantName: '',
      mediaState: {
        isMuted: false,
        isCameraOff: false,
      },
    };
  }

  return {
    socketId: peer.socketId,
    participantName: peer.participantName || '',
    mediaState: peer.mediaState || {
      isMuted: false,
      isCameraOff: false,
    },
  };
}

function readPrejoinPreferences() {
  try {
    return JSON.parse(localStorage.getItem('clipmeet.prejoin')) || {};
  } catch {
    return {};
  }
}

function useWebRTC(roomCode, participantName = 'Guest', roomName = roomCode) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [localStream, setLocalStream] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [peerNames, setPeerNames] = useState({});
  const [serverRoomName, setServerRoomName] = useState(roomName);
  const [startedAt, setStartedAt] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState('');
  const [screenShare, setScreenShare] = useState({
    isActive: false,
    sharerSocketId: '',
    sharerName: '',
    stream: null,
    streamId: '',
    isLocalSharing: false,
    requestStatus: '',
    requestError: '',
  });
  const [pendingScreenShareRequest, setPendingScreenShareRequest] = useState(null);

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const socketRef = useRef(null);
  const localSocketIdRef = useRef('');
  const peerConnectionsRef = useRef({});
  const peerCameraStreamsRef = useRef({});
  const peerScreenStreamsRef = useRef({});
  const peerIncomingStreamsRef = useRef({});
  const pendingIceCandidatesRef = useRef({});
  const peerNamesRef = useRef({});
  const peerMediaStateRef = useRef({});
  const peerScreenMetaRef = useRef({});
  const localMediaStateRef = useRef({ isMuted: false, isCameraOff: false });
  const hasLeftRef = useRef(false);

  const upsertRemoteParticipant = useCallback((peerId, overrides = {}) => {
    setRemoteParticipants((current) => {
      const name = overrides.name || peerNamesRef.current[peerId] || buildPeerLabel(peerId, '');
      const mediaState = peerMediaStateRef.current[peerId] || {
        isMuted: false,
        isCameraOff: false,
      };
      const nextParticipant = {
        id: peerId,
        name,
        stream: peerCameraStreamsRef.current[peerId] || null,
        isLocal: false,
        isMuted: Boolean(mediaState.isMuted),
        isCameraOff: Boolean(mediaState.isCameraOff),
        ...overrides,
      };

      const existingIndex = current.findIndex((participant) => participant.id === peerId);
      if (existingIndex === -1) {
        return [...current, nextParticipant];
      }

      const nextParticipants = [...current];
      nextParticipants[existingIndex] = {
        ...nextParticipants[existingIndex],
        ...nextParticipant,
      };
      return nextParticipants;
    });
  }, []);

  const setPeerName = useCallback((peerId, name) => {
    if (!peerId || !name) {
      return;
    }

    peerNamesRef.current = {
      ...peerNamesRef.current,
      [peerId]: name,
    };
    setPeerNames(peerNamesRef.current);
    upsertRemoteParticipant(peerId, {
      name: buildPeerLabel(peerId, name),
    });
  }, [upsertRemoteParticipant]);

  const setPeerMediaState = useCallback((peerId, mediaState = {}) => {
    if (!peerId) {
      return;
    }

    peerMediaStateRef.current = {
      ...peerMediaStateRef.current,
      [peerId]: {
        isMuted: Boolean(mediaState.isMuted),
        isCameraOff: Boolean(mediaState.isCameraOff),
      },
    };

    upsertRemoteParticipant(peerId);
  }, [upsertRemoteParticipant]);

  const applyScreenShareState = useCallback((nextState) => {
    setScreenShare((current) => ({
      ...current,
      ...nextState,
    }));
  }, []);

  const syncActiveScreenShareStream = useCallback((peerId) => {
    const activeScreenMeta = peerScreenMetaRef.current[peerId];
    if (!activeScreenMeta?.isActive) {
      return;
    }

    applyScreenShareState({
      isActive: true,
      sharerSocketId: peerId === localSocketIdRef.current ? 'local' : peerId,
      sharerName: activeScreenMeta.sharerName || peerNamesRef.current[peerId] || buildPeerLabel(peerId, ''),
      streamId: activeScreenMeta.streamId || '',
      stream: peerScreenStreamsRef.current[peerId] || null,
      isLocalSharing: peerId === localSocketIdRef.current,
    });
  }, [applyScreenShareState]);

  const classifyIncomingStream = useCallback((peerId, stream) => {
    if (!stream) {
      return 'camera';
    }

    peerIncomingStreamsRef.current[peerId] = {
      ...(peerIncomingStreamsRef.current[peerId] || {}),
      [stream.id]: stream,
    };

    const activeScreenMeta = peerScreenMetaRef.current[peerId];
    if (activeScreenMeta?.streamId && stream.id === activeScreenMeta.streamId) {
      peerScreenStreamsRef.current[peerId] = stream;
      syncActiveScreenShareStream(peerId);
      return 'screen';
    }

    peerCameraStreamsRef.current[peerId] = stream;
    upsertRemoteParticipant(peerId, { stream });
    return 'camera';
  }, [syncActiveScreenShareStream, upsertRemoteParticipant]);

  const applyIncomingScreenMeta = useCallback((peerId, meta = {}) => {
    peerScreenMetaRef.current[peerId] = {
      isActive: Boolean(meta.isActive),
      streamId: meta.streamId || '',
      sharerName: meta.sharerName || peerNamesRef.current[peerId] || '',
    };

    const incomingStream = meta.streamId
      ? peerIncomingStreamsRef.current[peerId]?.[meta.streamId]
      : null;

    if (incomingStream) {
      peerScreenStreamsRef.current[peerId] = incomingStream;
      syncActiveScreenShareStream(peerId);
    }
  }, [syncActiveScreenShareStream]);

  const emitMediaState = useCallback((mediaState) => {
    socketRef.current?.emit('media-state-changed', mediaState);
  }, []);

  const flushPendingIceCandidates = useCallback(async (peerId, connection) => {
    const queuedCandidates = pendingIceCandidatesRef.current[peerId];
    if (!queuedCandidates?.length || !connection.remoteDescription) {
      return;
    }

    delete pendingIceCandidatesRef.current[peerId];

    for (const candidate of queuedCandidates) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (iceError) {
        console.error('Failed to flush ICE candidate:', iceError);
      }
    }
  }, []);

  const attachLocalTracksToConnection = useCallback((connection) => {
    localStreamRef.current?.getTracks().forEach((track) => {
      const alreadyAdded = connection.getSenders().some((sender) => sender.track?.id === track.id);
      if (!alreadyAdded) {
        connection.addTrack(track, localStreamRef.current);
      }
    });

    const screenTrack = screenStreamRef.current?.getVideoTracks()[0];
    if (screenTrack) {
      const alreadyAdded = connection.getSenders().some((sender) => sender.track?.id === screenTrack.id);
      if (!alreadyAdded) {
        connection.addTrack(screenTrack, screenStreamRef.current);
      }
    }
  }, []);

  const createPeerConnection = useCallback((peerId, peerName = '') => {
    const existingConnection = peerConnectionsRef.current[peerId];
    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(RTC_CONFIGURATION);
    attachLocalTracksToConnection(connection);

    connection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) {
        return;
      }

      socketRef.current.emit('ice-candidate', {
        target: peerId,
        candidate: event.candidate,
      });
    };

    connection.ontrack = (event) => {
      const [incomingStream] = event.streams;
      if (!incomingStream) {
        return;
      }

      const streamType = classifyIncomingStream(peerId, incomingStream);

      if (streamType === 'camera') {
        upsertRemoteParticipant(peerId, {
          name: buildPeerLabel(peerId, peerNamesRef.current[peerId] || peerName),
          stream: incomingStream,
        });
      } else {
        syncActiveScreenShareStream(peerId);
      }
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(connection.connectionState)) {
        const existingScreenShare = peerScreenMetaRef.current[peerId];
        if (existingScreenShare?.isActive) {
          applyScreenShareState({
            isActive: false,
            sharerSocketId: '',
            sharerName: '',
            stream: null,
            streamId: '',
            isLocalSharing: false,
          });
        }

        const existing = peerConnectionsRef.current[peerId];
        if (existing) {
          existing.onicecandidate = null;
          existing.ontrack = null;
          existing.onconnectionstatechange = null;
          existing.close();
          delete peerConnectionsRef.current[peerId];
        }

        delete peerCameraStreamsRef.current[peerId];
        delete peerScreenStreamsRef.current[peerId];
        delete peerIncomingStreamsRef.current[peerId];
        delete pendingIceCandidatesRef.current[peerId];
        delete peerNamesRef.current[peerId];
        delete peerMediaStateRef.current[peerId];
        delete peerScreenMetaRef.current[peerId];
        setPeerNames({ ...peerNamesRef.current });
        setRemoteParticipants((current) => current.filter((participant) => participant.id !== peerId));
      }
    };

    peerConnectionsRef.current[peerId] = connection;
    return connection;
  }, [applyScreenShareState, attachLocalTracksToConnection, classifyIncomingStream, syncActiveScreenShareStream, upsertRemoteParticipant]);

  const sendOfferToPeer = useCallback(async (peerId, peerName = '') => {
    const connection = createPeerConnection(peerId, peerName);
    attachLocalTracksToConnection(connection);

    if (connection.signalingState !== 'stable') {
      return;
    }

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    socketRef.current?.emit('offer', {
      target: peerId,
      participantName,
      mediaState: localMediaStateRef.current,
      offer,
    });
  }, [attachLocalTracksToConnection, createPeerConnection, participantName]);

  const renegotiateAllPeers = useCallback(async () => {
    const peers = Object.keys(peerConnectionsRef.current);
    for (const peerId of peers) {
      try {
        await sendOfferToPeer(peerId, peerNamesRef.current[peerId] || '');
      } catch (offerError) {
        console.error('Failed to renegotiate peer:', offerError);
      }
    }
  }, [sendOfferToPeer]);

  const resetRemotePeers = useCallback(() => {
    Object.values(peerConnectionsRef.current).forEach((connection) => {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
    });

    peerConnectionsRef.current = {};
    peerCameraStreamsRef.current = {};
    peerScreenStreamsRef.current = {};
    peerIncomingStreamsRef.current = {};
    pendingIceCandidatesRef.current = {};
    peerNamesRef.current = {};
    peerMediaStateRef.current = {};
    peerScreenMetaRef.current = {};
    setPeerNames({});
    setRemoteParticipants([]);

    setScreenShare((current) => ({
      ...current,
      isActive: current.isLocalSharing && Boolean(screenStreamRef.current),
      sharerSocketId: current.isLocalSharing ? 'local' : '',
      sharerName: current.isLocalSharing ? participantName : '',
      stream: current.isLocalSharing ? screenStreamRef.current : null,
      streamId: current.isLocalSharing ? (screenStreamRef.current?.id || '') : '',
    }));
  }, [participantName]);

  const cleanup = useCallback(() => {
    if (hasLeftRef.current) {
      return;
    }

    hasLeftRef.current = true;
    resetRemotePeers();

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (socketRef.current) {
      socketRef.current.emit('leave-room');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
  }, [resetRemotePeers]);

  const stopScreenShare = useCallback(async () => {
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0];

    if (screenTrack) {
      Object.values(peerConnectionsRef.current).forEach((connection) => {
        const sender = connection.getSenders().find((item) => item.track?.id === screenTrack.id);
        if (sender) {
          connection.removeTrack(sender);
        }
      });
    }

    socketRef.current?.emit('screenshare-stopped', {
      roomCode: normalizedRoomCode,
    });

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    applyScreenShareState({
      isActive: false,
      sharerSocketId: '',
      sharerName: '',
      stream: null,
      streamId: '',
      isLocalSharing: false,
      requestStatus: '',
    });

    await renegotiateAllPeers();
  }, [applyScreenShareState, normalizedRoomCode, renegotiateAllPeers]);

  const startApprovedScreenShare = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Browser ini tidak mendukung screen share atau halaman belum berjalan di konteks aman (HTTPS/localhost).');
      }

      applyScreenShareState({
        requestStatus: 'Memilih layar...',
        requestError: '',
      });

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [screenTrack] = displayStream.getVideoTracks();

      if (!screenTrack) {
        throw new Error('Screen share track tidak tersedia.');
      }

      screenStreamRef.current = displayStream;
      screenTrack.onended = () => {
        stopScreenShare().catch((shareError) => {
          console.error('Failed to stop screen share:', shareError);
        });
      };

      Object.values(peerConnectionsRef.current).forEach((connection) => {
        const alreadyAdded = connection.getSenders().some((sender) => sender.track?.id === screenTrack.id);
        if (!alreadyAdded) {
          connection.addTrack(screenTrack, displayStream);
        }
      });

      socketRef.current?.emit('screenshare-started', {
        roomCode: normalizedRoomCode,
        sharerName: participantName,
        streamId: displayStream.id,
      });

      applyScreenShareState({
        isActive: true,
        sharerSocketId: 'local',
        sharerName: participantName,
        stream: displayStream,
        streamId: displayStream.id,
        isLocalSharing: true,
        requestStatus: '',
        requestError: '',
      });

      await renegotiateAllPeers();
    } catch (shareError) {
      console.error('Failed to start screen share:', shareError);
      const screenShareMessage = shareError?.name === 'NotAllowedError'
        ? 'Izin screen share ditolak. Pastikan Anda mengizinkan browser membagikan layar.'
        : shareError?.message || 'Gagal memulai screen share.';
      applyScreenShareState({
        requestStatus: '',
        requestError: screenShareMessage,
      });
    }
  }, [applyScreenShareState, normalizedRoomCode, participantName, renegotiateAllPeers, stopScreenShare]);

  useEffect(() => {
    let isMounted = true;

    const setupWebRTC = async () => {
      try {
        hasLeftRef.current = false;
        const prejoinPreferences = readPrejoinPreferences();
        const stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);

        const shouldEnableMic = prejoinPreferences.isMicOn !== false;
        const shouldEnableCamera = prejoinPreferences.isCamOn !== false;

        stream.getAudioTracks().forEach((track) => {
          track.enabled = shouldEnableMic;
        });
        stream.getVideoTracks().forEach((track) => {
          track.enabled = shouldEnableCamera;
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        localMediaStateRef.current = {
          isMuted: !shouldEnableMic,
          isCameraOff: !shouldEnableCamera,
        };
        setLocalStream(stream);
        setIsMuted(!shouldEnableMic);
        setIsCameraOff(!shouldEnableCamera);
        setError('');

        const socket = io(SIGNALING_SERVER_URL, {
          transports: ['websocket'],
          reconnection: true,
        });
        socketRef.current = socket;

        const joinRoom = () => {
          socket.emit('join-room', {
            roomCode: normalizedRoomCode,
            participantName,
            roomName,
            ...localMediaStateRef.current,
          });
        };

        socket.on('connect', () => {
          const previousSocketId = localSocketIdRef.current;
          localSocketIdRef.current = socket.id;

          if (previousSocketId && previousSocketId !== socket.id) {
            resetRemotePeers();
          }

          joinRoom();
          socket.emit('get-room-state', { roomCode: normalizedRoomCode });

          if (screenStreamRef.current) {
            socket.emit('screenshare-started', {
              roomCode: normalizedRoomCode,
              sharerName: participantName,
              streamId: screenStreamRef.current.id,
            });
          }
        });

        socket.on('room-info', (roomInfo) => {
          if (roomInfo.roomCode === normalizedRoomCode && roomInfo.roomName) {
            setServerRoomName(roomInfo.roomName);
          }
        });

        socket.on('room-state', (roomState) => {
          if (roomState.roomCode !== normalizedRoomCode) {
            return;
          }

          setStartedAt(roomState.startedAt || null);
          if (roomState.roomName) {
            setServerRoomName(roomState.roomName);
          }

          roomState.participants
            ?.map(normalizePeer)
            .filter((peer) => peer.socketId !== localSocketIdRef.current)
            .forEach((peer) => {
              setPeerName(peer.socketId, peer.participantName);
              setPeerMediaState(peer.socketId, peer.mediaState);
            });

          const activeScreenShare = roomState.screenShareStatus;
          if (activeScreenShare?.isActive && activeScreenShare.sharerSocketId) {
            const isLocalShare = activeScreenShare.sharerSocketId === localSocketIdRef.current;
            if (!isLocalShare) {
              applyIncomingScreenMeta(activeScreenShare.sharerSocketId, {
                isActive: true,
                streamId: activeScreenShare.streamId,
                sharerName: activeScreenShare.sharerName,
              });
            }

            applyScreenShareState({
              isActive: true,
              sharerSocketId: isLocalShare ? 'local' : activeScreenShare.sharerSocketId,
              sharerName: activeScreenShare.sharerName,
              streamId: activeScreenShare.streamId || '',
              stream: isLocalShare
                ? screenStreamRef.current
                : peerScreenStreamsRef.current[activeScreenShare.sharerSocketId] || null,
              isLocalSharing: isLocalShare,
            });
          }
        });

        socket.on('room-join-error', ({ roomCode: failedRoomCode, message }) => {
          if (failedRoomCode !== normalizedRoomCode) {
            return;
          }

          setError(message || 'Failed to join room.');
          socket.disconnect();
        });

        socket.on('existing-peers', (existingPeers) => {
          existingPeers.map(normalizePeer).forEach((peer) => {
            setPeerName(peer.socketId, peer.participantName);
            setPeerMediaState(peer.socketId, peer.mediaState);
          });
        });

        socket.on('user-joined', async ({ socketId, participantName: peerName, mediaState }) => {
          if (!socketId || socketId === localSocketIdRef.current) {
            return;
          }

          setPeerName(socketId, peerName);
          setPeerMediaState(socketId, mediaState);

          try {
            await sendOfferToPeer(socketId, peerName);
          } catch (offerError) {
            console.error('Failed to create offer for new peer:', offerError);
          }
        });

        socket.on('offer', async ({ caller, offer, participantName: peerName, mediaState }) => {
          setPeerName(caller, peerName);
          setPeerMediaState(caller, mediaState);

          const connection = createPeerConnection(caller, peerName);
          attachLocalTracksToConnection(connection);
          await connection.setRemoteDescription(new RTCSessionDescription(offer));
          await flushPendingIceCandidates(caller, connection);

          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);

          socket.emit('answer', {
            target: caller,
            participantName,
            mediaState: localMediaStateRef.current,
            answer,
          });
        });

        socket.on('answer', async ({ caller, answer, participantName: peerName, mediaState }) => {
          setPeerName(caller, peerName);
          setPeerMediaState(caller, mediaState);

          const connection = peerConnectionsRef.current[caller];
          if (!connection) {
            return;
          }

          await connection.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingIceCandidates(caller, connection);
        });

        socket.on('ice-candidate', async ({ caller, candidate }) => {
          const connection = peerConnectionsRef.current[caller];
          if (!candidate) {
            return;
          }

          if (!connection || !connection.remoteDescription) {
            pendingIceCandidatesRef.current[caller] = [
              ...(pendingIceCandidatesRef.current[caller] || []),
              candidate,
            ];
            return;
          }

          try {
            await connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (iceError) {
            console.error('Failed to add ICE candidate:', iceError);
          }
        });

        socket.on('user-left', (payload) => {
          const peerId = typeof payload === 'string' ? payload : payload.socketId;
          const activeScreenShare = peerScreenMetaRef.current[peerId];
          if (activeScreenShare?.isActive) {
            applyScreenShareState({
              isActive: false,
              sharerSocketId: '',
              sharerName: '',
              stream: null,
              streamId: '',
              isLocalSharing: false,
            });
          }

          const connection = peerConnectionsRef.current[peerId];
          if (connection) {
            connection.onicecandidate = null;
            connection.ontrack = null;
            connection.onconnectionstatechange = null;
            connection.close();
            delete peerConnectionsRef.current[peerId];
          }

          delete peerCameraStreamsRef.current[peerId];
          delete peerScreenStreamsRef.current[peerId];
          delete peerIncomingStreamsRef.current[peerId];
          delete pendingIceCandidatesRef.current[peerId];
          delete peerNamesRef.current[peerId];
          delete peerMediaStateRef.current[peerId];
          delete peerScreenMetaRef.current[peerId];
          setPeerNames({ ...peerNamesRef.current });
          setRemoteParticipants((current) => current.filter((participant) => participant.id !== peerId));
        });

        socket.on('peer-left', (payload) => {
          const peerId = typeof payload === 'string' ? payload : payload.socketId;
          setRemoteParticipants((current) => current.filter((participant) => participant.id !== peerId));
        });

        socket.on('media-state-changed', ({ socketId, isMuted: nextMuted, isCameraOff: nextCameraOff }) => {
          setPeerMediaState(socketId, {
            isMuted: nextMuted,
            isCameraOff: nextCameraOff,
          });
        });

        socket.on('screenshare-request', (request) => {
          setPendingScreenShareRequest(request);
        });

        socket.on('screenshare-approved', () => {
          startApprovedScreenShare();
        });

        socket.on('screenshare-rejected', ({ message }) => {
          applyScreenShareState({
            requestStatus: '',
            requestError: message || 'Permintaan ditolak oleh host.',
          });
        });

        socket.on('screenshare-started', ({ sharerSocketId, sharerName, streamId }) => {
          const isLocalShare = sharerSocketId === localSocketIdRef.current;

          if (!isLocalShare) {
            applyIncomingScreenMeta(sharerSocketId, {
              isActive: true,
              streamId,
              sharerName,
            });
          }

          applyScreenShareState({
            isActive: true,
            sharerSocketId: isLocalShare ? 'local' : sharerSocketId,
            sharerName,
            streamId: streamId || '',
            stream: isLocalShare
              ? screenStreamRef.current
              : peerScreenStreamsRef.current[sharerSocketId] || null,
            isLocalSharing: isLocalShare,
            requestStatus: '',
            requestError: '',
          });
        });

        socket.on('screenshare-stopped', ({ sharerSocketId }) => {
          const isLocalShare = sharerSocketId === localSocketIdRef.current;
          if (!isLocalShare) {
            delete peerScreenStreamsRef.current[sharerSocketId];
            delete peerScreenMetaRef.current[sharerSocketId];
          }

          setScreenShare((current) => {
            if (!current.sharerSocketId) {
              return current;
            }

            const currentSharerId = current.sharerSocketId === 'local'
              ? localSocketIdRef.current
              : current.sharerSocketId;

            if (currentSharerId !== sharerSocketId) {
              return current;
            }

            return {
              ...current,
              isActive: false,
              sharerSocketId: '',
              sharerName: '',
              stream: null,
              streamId: '',
              isLocalSharing: false,
              requestStatus: '',
            };
          });
        });
      } catch (mediaError) {
        console.error('Failed to initialize WebRTC:', mediaError);
        if (isMounted) {
          setError('Camera or microphone access failed.');
        }
      }
    };

    setupWebRTC();

    return () => {
      isMounted = false;
      localStorage.removeItem('clipmeet.prejoin');
      cleanup();
    };
  }, [
    applyIncomingScreenMeta,
    applyScreenShareState,
    attachLocalTracksToConnection,
    cleanup,
    createPeerConnection,
    flushPendingIceCandidates,
    normalizedRoomCode,
    participantName,
    resetRemotePeers,
    roomName,
    sendOfferToPeer,
    setPeerMediaState,
    setPeerName,
    startApprovedScreenShare,
  ]);

  const toggleMute = useCallback(() => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    if (audioTracks.length === 0) {
      return;
    }

    const nextMuted = !localMediaStateRef.current.isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });
    localMediaStateRef.current = {
      ...localMediaStateRef.current,
      isMuted: nextMuted,
    };
    setIsMuted(nextMuted);
    emitMediaState(localMediaStateRef.current);
  }, [emitMediaState]);

  const toggleCamera = useCallback(() => {
    const videoTracks = localStreamRef.current?.getVideoTracks() || [];
    if (videoTracks.length === 0) {
      return;
    }

    const nextCameraOff = !localMediaStateRef.current.isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    localMediaStateRef.current = {
      ...localMediaStateRef.current,
      isCameraOff: nextCameraOff,
    };
    setIsCameraOff(nextCameraOff);
    emitMediaState(localMediaStateRef.current);
  }, [emitMediaState]);

  const requestScreenShare = useCallback(() => {
    if (!socketRef.current || screenShare.isActive || screenShare.requestStatus) {
      return;
    }

    applyScreenShareState({
      requestStatus: 'Menunggu persetujuan host...',
      requestError: '',
    });

    socketRef.current.emit('request-screenshare', {
      roomCode: normalizedRoomCode,
      requesterName: participantName,
    });
  }, [applyScreenShareState, normalizedRoomCode, participantName, screenShare.isActive, screenShare.requestStatus]);

  const approveScreenShareRequest = useCallback((request) => {
    if (!socketRef.current || !request?.requesterSocketId) {
      return;
    }

    socketRef.current.emit('screenshare-approved', {
      roomCode: normalizedRoomCode,
      requesterSocketId: request.requesterSocketId,
    });
    setPendingScreenShareRequest(null);
  }, [normalizedRoomCode]);

  const rejectScreenShareRequest = useCallback((request) => {
    if (!socketRef.current || !request?.requesterSocketId) {
      return;
    }

    socketRef.current.emit('screenshare-rejected', {
      roomCode: normalizedRoomCode,
      requesterSocketId: request.requesterSocketId,
    });
    setPendingScreenShareRequest(null);
  }, [normalizedRoomCode]);

  const participants = useMemo(() => {
    const localParticipant = {
      id: 'local',
      name: `You (${participantName})`,
      stream: localStream,
      isLocal: true,
      isMuted,
      isCameraOff,
    };

    return [localParticipant, ...remoteParticipants];
  }, [isCameraOff, isMuted, localStream, participantName, remoteParticipants]);

  return {
    participants,
    peerNames,
    roomName: serverRoomName,
    startedAt,
    isMuted,
    isCameraOff,
    screenShare,
    pendingScreenShareRequest,
    error,
    toggleMute,
    toggleCamera,
    requestScreenShare,
    approveScreenShareRequest,
    rejectScreenShareRequest,
    stopScreenShare,
    leaveMeeting: cleanup,
  };
}

export default useWebRTC;

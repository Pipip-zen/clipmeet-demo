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
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState('');
  const [screenShare, setScreenShare] = useState({
    isActive: false,
    sharerSocketId: '',
    sharerName: '',
    stream: null,
    isLocalSharing: false,
    requestStatus: '',
    requestError: '',
  });
  const [pendingScreenShareRequest, setPendingScreenShareRequest] = useState(null);

  const localStreamRef = useRef(null);
  const cameraVideoTrackRef = useRef(null);
  const screenStreamRef = useRef(null);
  const socketRef = useRef(null);
  const localSocketIdRef = useRef('');
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const peerNamesRef = useRef({});
  const peerMediaStateRef = useRef({});
  const localMediaStateRef = useRef({ isMuted: false, isCameraOff: false });
  const hasLeftRef = useRef(false);

  const setPeerName = useCallback((peerId, name) => {
    if (!peerId || !name) {
      return;
    }

    peerNamesRef.current = {
      ...peerNamesRef.current,
      [peerId]: name,
    };
    setPeerNames(peerNamesRef.current);
  }, []);

  const removePeer = useCallback((peerId) => {
    const connection = peerConnectionsRef.current[peerId];
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.close();
      delete peerConnectionsRef.current[peerId];
    }

    delete remoteStreamsRef.current[peerId];
    delete peerNamesRef.current[peerId];
    delete peerMediaStateRef.current[peerId];
    setPeerNames({ ...peerNamesRef.current });
    setRemoteParticipants((current) => current.filter((participant) => participant.id !== peerId));
  }, []);

  const setPeerMediaState = useCallback((peerId, mediaState = {}) => {
    if (!peerId) {
      return;
    }

    const nextMediaState = {
      isMuted: Boolean(mediaState.isMuted),
      isCameraOff: Boolean(mediaState.isCameraOff),
    };
    peerMediaStateRef.current = {
      ...peerMediaStateRef.current,
      [peerId]: nextMediaState,
    };

    setRemoteParticipants((current) =>
      current.map((participant) =>
        participant.id === peerId
          ? {
              ...participant,
              ...nextMediaState,
            }
          : participant
      )
    );
  }, []);

  const emitMediaState = useCallback((mediaState) => {
    if (!socketRef.current) {
      return;
    }

    socketRef.current.emit('media-state-changed', mediaState);
  }, []);

  const replaceOutgoingVideoTrack = useCallback(async (nextTrack) => {
    const replacements = Object.values(peerConnectionsRef.current).map(async (connection) => {
      const sender = connection.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(nextTrack);
      }
    });

    await Promise.all(replacements);
  }, []);

  const createPeerConnection = useCallback((peerId, peerName = '') => {
    const existingConnection = peerConnectionsRef.current[peerId];
    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(RTC_CONFIGURATION);

    localStreamRef.current?.getTracks().forEach((track) => {
      const activeScreenTrack = screenStreamRef.current?.getVideoTracks()[0];
      const outboundTrack = track.kind === 'video' && activeScreenTrack
        ? activeScreenTrack
        : track;

      connection.addTrack(outboundTrack, localStreamRef.current);
    });

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
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      remoteStreamsRef.current[peerId] = stream;
      setRemoteParticipants((current) => {
        const currentMediaState = peerMediaStateRef.current[peerId] || {};
        const nextParticipant = {
          id: peerId,
          name: buildPeerLabel(peerId, peerNamesRef.current[peerId] || peerName),
          stream,
          isLocal: false,
          isMuted: Boolean(currentMediaState.isMuted),
          isCameraOff: Boolean(currentMediaState.isCameraOff),
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
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        removePeer(peerId);
      }
    };

    peerConnectionsRef.current[peerId] = connection;
    return connection;
  }, [removePeer]);

  const cleanup = useCallback(() => {
    if (hasLeftRef.current) {
      return;
    }

    hasLeftRef.current = true;

    Object.values(peerConnectionsRef.current).forEach((connection) => {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.close();
    });
    peerConnectionsRef.current = {};
    remoteStreamsRef.current = {};

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    cameraVideoTrackRef.current = null;

    if (socketRef.current) {
      socketRef.current.emit('leave-room');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setRemoteParticipants([]);
    setLocalStream(null);
  }, []);

  const stopScreenShare = useCallback(async () => {
    const cameraTrack = cameraVideoTrackRef.current;

    await replaceOutgoingVideoTrack(cameraTrack || null);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    if (socketRef.current) {
      socketRef.current.emit('screenshare-stopped', {
        roomCode: normalizedRoomCode,
      });
    }

    setScreenShare((current) => ({
      ...current,
      isActive: false,
      sharerSocketId: '',
      sharerName: '',
      stream: null,
      isLocalSharing: false,
      requestStatus: '',
    }));
  }, [normalizedRoomCode, replaceOutgoingVideoTrack]);

  const startApprovedScreenShare = useCallback(async () => {
    try {
      setScreenShare((current) => ({
        ...current,
        requestStatus: 'Memilih layar...',
        requestError: '',
      }));

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

      await replaceOutgoingVideoTrack(screenTrack);

      socketRef.current?.emit('screenshare-started', {
        roomCode: normalizedRoomCode,
        sharerName: participantName,
      });

      setScreenShare({
        isActive: true,
        sharerSocketId: 'local',
        sharerName: participantName,
        stream: displayStream,
        isLocalSharing: true,
        requestStatus: '',
        requestError: '',
      });
    } catch (shareError) {
      console.error('Failed to start screen share:', shareError);
      setScreenShare((current) => ({
        ...current,
        requestStatus: '',
        requestError: shareError.message || 'Gagal memulai screen share.',
      }));
    }
  }, [normalizedRoomCode, participantName, replaceOutgoingVideoTrack, stopScreenShare]);

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
        cameraVideoTrackRef.current = stream.getVideoTracks()[0] || null;
        localMediaStateRef.current = {
          isMuted: !shouldEnableMic,
          isCameraOff: !shouldEnableCamera,
        };
        setLocalStream(stream);
        setIsMuted(!shouldEnableMic);
        setIsCameraOff(!shouldEnableCamera);

        const socket = io(SIGNALING_SERVER_URL, {
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          localSocketIdRef.current = socket.id;
          socket.emit('join-room', {
            roomCode: normalizedRoomCode,
            participantName,
            roomName,
            ...localMediaStateRef.current,
          });
        });

        socket.on('room-info', (roomInfo) => {
          if (roomInfo.roomCode === normalizedRoomCode && roomInfo.roomName) {
            setServerRoomName(roomInfo.roomName);
          }
        });

        socket.on('room-join-error', ({ roomCode: failedRoomCode, message }) => {
          if (failedRoomCode !== normalizedRoomCode) {
            return;
          }

          setError(message || 'Failed to join room.');
          socket.disconnect();
        });

        socket.on('existing-peers', async (existingPeers) => {
          for (const peer of existingPeers.map(normalizePeer)) {
            setPeerName(peer.socketId, peer.participantName);
            setPeerMediaState(peer.socketId, peer.mediaState);
            const connection = createPeerConnection(peer.socketId, peer.participantName);
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            socket.emit('offer', {
              target: peer.socketId,
              participantName,
              mediaState: localMediaStateRef.current,
              offer,
            });
          }
        });

        socket.on('offer', async ({ caller, offer, participantName: peerName, mediaState }) => {
          setPeerName(caller, peerName);
          setPeerMediaState(caller, mediaState);
          const connection = createPeerConnection(caller, peerName);
          await connection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);

          socket.emit('answer', {
            target: caller,
            participantName,
            mediaState: localMediaStateRef.current,
            answer,
          });
        });

        socket.on('answer', async ({ caller, answer, mediaState }) => {
          setPeerMediaState(caller, mediaState);
          const connection = peerConnectionsRef.current[caller];
          if (!connection) {
            return;
          }

          await connection.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('ice-candidate', async ({ caller, candidate }) => {
          const connection = peerConnectionsRef.current[caller];
          if (!connection || !candidate) {
            return;
          }

          try {
            await connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (iceError) {
            console.error('Failed to add ICE candidate:', iceError);
          }
        });

        socket.on('peer-left', (payload) => {
          removePeer(typeof payload === 'string' ? payload : payload.socketId);
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
          setScreenShare((current) => ({
            ...current,
            requestStatus: '',
            requestError: message || 'Permintaan ditolak oleh host.',
          }));
        });

        socket.on('screenshare-started', ({ sharerSocketId, sharerName }) => {
          const isLocal = sharerSocketId === localSocketIdRef.current;
          setScreenShare((current) => ({
            ...current,
            isActive: true,
            sharerSocketId,
            sharerName,
            stream: isLocal ? screenStreamRef.current : null,
            isLocalSharing: isLocal,
            requestStatus: '',
            requestError: '',
          }));
        });

        socket.on('screenshare-stopped', ({ sharerSocketId }) => {
          setScreenShare((current) => {
            if (current.sharerSocketId && current.sharerSocketId !== sharerSocketId) {
              return current;
            }

            return {
              ...current,
              isActive: false,
              sharerSocketId: '',
              sharerName: '',
              stream: null,
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
  }, [cleanup, createPeerConnection, normalizedRoomCode, participantName, removePeer, roomName, setPeerMediaState, setPeerName, startApprovedScreenShare]);

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

    setScreenShare((current) => ({
      ...current,
      requestStatus: 'Menunggu persetujuan host...',
      requestError: '',
    }));

    socketRef.current.emit('request-screenshare', {
      roomCode: normalizedRoomCode,
      requesterName: participantName,
    });
  }, [normalizedRoomCode, participantName, screenShare.isActive, screenShare.requestStatus]);

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

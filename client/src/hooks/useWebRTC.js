import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SIGNALING_SERVER_URL = 'http://localhost:3001';
const RTC_CONFIGURATION = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function buildPeerLabel(peerId) {
  return `Peer ${peerId.slice(0, 6)}`;
}

function useWebRTC(roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState('');

  const localStreamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const remoteStreamsRef = useRef({});
  const hasLeftRef = useRef(false);

  const removePeer = useCallback((peerId) => {
    const connection = peerConnectionsRef.current[peerId];
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.close();
      delete peerConnectionsRef.current[peerId];
    }

    delete remoteStreamsRef.current[peerId];
    setRemoteParticipants((current) => current.filter((participant) => participant.id !== peerId));
  }, []);

  const createPeerConnection = useCallback((peerId) => {
    const existingConnection = peerConnectionsRef.current[peerId];
    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(RTC_CONFIGURATION);

    localStreamRef.current?.getTracks().forEach((track) => {
      connection.addTrack(track, localStreamRef.current);
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
        const nextParticipant = {
          id: peerId,
          name: buildPeerLabel(peerId),
          stream,
          isLocal: false,
          isMuted: false,
          isCameraOff: false,
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

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (socketRef.current) {
      socketRef.current.emit('leave-room');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setRemoteParticipants([]);
    setLocalStream(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const setupWebRTC = async () => {
      try {
        hasLeftRef.current = false;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        const socket = io(SIGNALING_SERVER_URL, {
          transports: ['websocket'],
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          socket.emit('join-room', roomId);
        });

        socket.on('existing-peers', async (existingPeers) => {
          for (const peerId of existingPeers) {
            const connection = createPeerConnection(peerId);
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);

            socket.emit('offer', {
              target: peerId,
              offer,
            });
          }
        });

        socket.on('offer', async ({ caller, offer }) => {
          const connection = createPeerConnection(caller);
          await connection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);

          socket.emit('answer', {
            target: caller,
            answer,
          });
        });

        socket.on('answer', async ({ caller, answer }) => {
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

        socket.on('peer-left', (peerId) => {
          removePeer(peerId);
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
      cleanup();
    };
  }, [cleanup, createPeerConnection, removePeer, roomId]);

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    videoTrack.enabled = !videoTrack.enabled;
    setIsCameraOff(!videoTrack.enabled);
  }, []);

  const participants = useMemo(() => {
    const localParticipant = {
      id: 'local',
      name: 'You',
      stream: localStream,
      isLocal: true,
      isMuted,
      isCameraOff,
    };

    return [localParticipant, ...remoteParticipants];
  }, [isCameraOff, isMuted, localStream, remoteParticipants]);

  return {
    participants,
    isMuted,
    isCameraOff,
    error,
    toggleMute,
    toggleCamera,
    leaveMeeting: cleanup,
  };
}

export default useWebRTC;

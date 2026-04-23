import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Auth from "./Auth";

const socket = io(window.location.origin);

let peer = null;
let localStream = null;

export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState({});
  const [incomingRequest, setIncomingRequest] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const cleanUp = () => {
    setInCall(false);

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (peer) {
      peer.close();
      peer = null;
    }
  };

  useEffect(() => {
    if (!user) return;

    socket.emit("join", user);

    socket.on("users_list", setUsers);

    socket.on("sync_alert", (data) => {
      setIncomingRequest(data);
      setRoomId(data.roomId);
    });

    // RECEIVER
    socket.on("offer", async (data) => {
      setInCall(true);

      if (!peer) {
        await startCall();
        peer = createPeer();
      }

      await peer.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("answer", { roomId, answer });
    });

    // CALLER
    socket.on("answer", async (data) => {
      if (peer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
      }
    });

    socket.on("ice-candidate", (data) => {
      if (peer) {
        peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    socket.on("call_ended", cleanUp);

    return () => socket.off();
  }, [user, roomId]);

  const startCall = async () => {
    if (localStream) return;

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideoRef.current.srcObject = localStream;
  };

  // 🔥 FINAL PEER (TURN ADDED)
  const createPeer = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },

        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
        {
          urls: "turn:openrelay.metered.ca:443",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (e) => {
      console.log("REMOTE STREAM");
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice-candidate", {
          roomId,
          candidate: e.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("STATE:", pc.connectionState);
    };

    return pc;
  };

  const sendSync = (targetId) => {
    const room = socket.id + "-" + targetId;

    setRoomId(room);

    socket.emit("join_room", room); // 🔥 IMPORTANT

    setInCall(true);

    socket.emit("sync_request", {
      from: user,
      to: targetId,
    });
  };

  const acceptRequest = async () => {
    socket.emit("join_room", roomId);

    setIncomingRequest(null);
    setInCall(true);

    await startCall();

    peer = createPeer();

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("offer", { roomId, offer });
  };

  const toggleMic = () => {
    const t = localStream?.getAudioTracks()[0];
    if (t) t.enabled = !t.enabled;
  };

  const toggleCamera = () => {
    const t = localStream?.getVideoTracks()[0];
    if (t) t.enabled = !t.enabled;
  };

  const startScreenShare = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
    });

    const screenTrack = screenStream.getTracks()[0];

    const sender = peer
      ?.getSenders()
      .find((s) => s.track.kind === "video");

    if (sender) sender.replaceTrack(screenTrack);
  };

  const endCall = () => {
    socket.emit("end_call", { roomId });
    cleanUp();
  };

  return (
    <>
      {!user ? (
        <Auth setUser={setUser} />
      ) : (
        <div className="flex h-screen bg-black text-white">

          <div className="w-64 p-4 bg-gray-900">
            {Object.entries(users).map(([id, name]) => (
              <div
                key={id}
                onClick={() => id !== socket.id && sendSync(id)}
                className="cursor-pointer mb-2"
              >
                {name}
              </div>
            ))}
          </div>

          {incomingRequest && (
            <div className="fixed inset-0 flex items-center justify-center">
              <button onClick={acceptRequest}>Accept Call</button>
            </div>
          )}

          {inCall && (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">

              <video ref={localVideoRef} autoPlay muted className="w-1/3" />
              <video ref={remoteVideoRef} autoPlay className="w-1/3 mt-4" />

              <div className="flex gap-4 mt-4">
                <button onClick={toggleMic}>Mic</button>
                <button onClick={toggleCamera}>Camera</button>
                <button onClick={startScreenShare}>Share Screen</button>
              </div>

              <button onClick={endCall} className="mt-4 bg-red-500 px-4 py-2">
                End Call
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
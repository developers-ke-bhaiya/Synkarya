import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Auth from "./Auth";

const socket = io("https://synkarya.onrender.com");

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

  // 🔥 CLEANUP (CAMERA LIGHT FIX)
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

    // 🔥 RECEIVE OFFER
    socket.on("offer", async ({ offer }) => {
      console.log("📥 OFFER RECEIVED");

      await startCall();

      peer = createPeer();

      await peer.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("answer", { roomId, answer });
    });

    // 🔥 RECEIVE ANSWER
    socket.on("answer", async ({ answer }) => {
      console.log("📥 ANSWER RECEIVED");

      if (peer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

    // 🔥 ICE
    socket.on("ice-candidate", ({ candidate }) => {
      if (peer && candidate) {
        peer.addIceCandidate(new RTCIceCandidate(candidate));
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

  // 🔥 FINAL ICE FIX (IMPORTANT)
  const createPeer = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },

        // ✅ Working TURN (important for internet)
        {
          urls: "turn:relay1.expressturn.com:3478",
          username: "ef9Z1XQWQ4A3K7W9",
          credential: "Fv7wZx8gQh",
        },
      ],
    });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      console.log("🎥 REMOTE STREAM RECEIVED");
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          roomId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("STATE:", pc.connectionState);

      if (pc.connectionState === "failed") {
        console.log("❌ CONNECTION FAILED");
      }

      if (pc.connectionState === "connected") {
        console.log("✅ CONNECTED");
      }
    };

    return pc;
  };

  // 🔥 CALL START
  const sendSync = (targetId) => {
    const room = socket.id + "-" + targetId;

    setRoomId(room);

    socket.emit("join_room", room);

    setInCall(true);

    socket.emit("sync_request", {
      from: user,
      to: targetId,
    });
  };

  // 🔥 ACCEPT CALL
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
    const track = localStream?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
  };

  const toggleCamera = () => {
    const track = localStream?.getVideoTracks()[0];
    if (track) track.enabled = !track.enabled;
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

          {/* USERS */}
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

          {/* INCOMING */}
          {incomingRequest && (
            <div className="fixed inset-0 flex items-center justify-center">
              <button
                onClick={acceptRequest}
                className="bg-green-500 px-4 py-2"
              >
                Accept Call
              </button>
            </div>
          )}

          {/* CALL UI */}
          {inCall && (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">

              <video ref={localVideoRef} autoPlay muted className="w-1/3" />
              <video ref={remoteVideoRef} autoPlay className="w-1/3 mt-4" />

              <div className="flex gap-4 mt-4">
                <button onClick={toggleMic}>Mic</button>
                <button onClick={toggleCamera}>Camera</button>
                <button onClick={startScreenShare}>Share Screen</button>
              </div>

              <button
                onClick={endCall}
                className="mt-4 bg-red-500 px-4 py-2"
              >
                End Call
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
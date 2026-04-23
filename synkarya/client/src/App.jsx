import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import Auth from "./Auth";

const socket = io("https://synkarya.onrender.com", {
  transports: ["websocket"],
});

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

  // 🔥 CLEANUP
  const cleanUp = () => {
    setInCall(false);

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    if (peer) {
      peer.close();
      peer = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!user) return;

    socket.emit("join", user);

    socket.on("users_list", setUsers);

    socket.on("sync_alert", (data) => {
      setIncomingRequest(data);
      setRoomId(data.roomId);
    });

    // 🔥 RECEIVER (gets offer → sends answer)
    socket.on("offer", async ({ offer }) => {
      await startCall();

      if (!peer) peer = createPeer();

      await peer.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit("answer", { roomId, answer });
    });

    // 🔥 CALLER (gets answer)
    socket.on("answer", async ({ answer }) => {
      if (peer) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

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
        {
          urls: "turn:openrelay.metered.ca:443?transport=tcp",
          username: "openrelayproject",
          credential: "openrelayproject",
        },
      ],
    });

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
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
    };

    return pc;
  };

  // 🔥 CALLER → creates offer
  const sendSync = async (targetId) => {
    const room = [socket.id, targetId].sort().join("-");

    setRoomId(room);
    setInCall(true);

    socket.emit("join_room", room);

    await startCall();

    peer = createPeer();

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    socket.emit("offer", { roomId: room, offer });

    socket.emit("sync_request", {
      from: user,
      to: targetId,
      roomId: room,
    });
  };

  // 🔥 RECEIVER → only join (no offer)
  const acceptRequest = async () => {
    socket.emit("join_room", roomId);

    setIncomingRequest(null);
    setInCall(true);

    await startCall();

    peer = createPeer();
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
              <button
                onClick={acceptRequest}
                className="bg-green-500 px-4 py-2"
              >
                Accept Call
              </button>
            </div>
          )}

          {inCall && (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-black">

              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-1/3"
              />

              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-1/3 mt-4"
              />

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
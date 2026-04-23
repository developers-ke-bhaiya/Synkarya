import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://synkarya.onrender.com"); // backend URL

export default function App() {
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState({});
  const [roomId, setRoomId] = useState(null);

  const localVideo = useRef();
  const remoteVideo = useRef();

  const pc = useRef(null);
  const localStream = useRef(null);

  // 🔥 ICE FIXED
  const createPeer = () => {
    pc.current = new RTCPeerConnection({
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

    pc.current.ontrack = (e) => {
      console.log("REMOTE STREAM");
      remoteVideo.current.srcObject = e.streams[0];
    };

    pc.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("ice", { roomId, candidate: e.candidate });
      }
    };
  };

  const startMedia = async () => {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = localStream.current;
  };

  const startCall = async () => {
    await startMedia();
    createPeer();

    localStream.current.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream.current);
    });

    const offer = await pc.current.createOffer();
    await pc.current.setLocalDescription(offer);

    socket.emit("offer", { roomId, offer });
  };

  const answerCall = async (offer) => {
    await startMedia();
    createPeer();

    localStream.current.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream.current);
    });

    await pc.current.setRemoteDescription(offer);

    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);

    socket.emit("answer", { roomId, answer });
  };

  const endCall = () => {
    if (pc.current) pc.current.close();

    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
    }

    localVideo.current.srcObject = null;
    remoteVideo.current.srcObject = null;

    socket.emit("end-call", { roomId });
    setRoomId(null);
  };

  useEffect(() => {
    socket.on("users", setUsers);

    socket.on("incoming-call", async ({ from, roomId }) => {
      setRoomId(roomId);
      socket.emit("join-room", roomId);
    });

    socket.on("offer", async (offer) => {
      await answerCall(offer);
    });

    socket.on("answer", async (answer) => {
      await pc.current.setRemoteDescription(answer);
    });

    socket.on("ice", async (candidate) => {
      await pc.current.addIceCandidate(candidate);
    });

    socket.on("call-ended", endCall);
  }, [roomId]);

  const callUser = (id) => {
    const room = [socket.id, id].sort().join("-");
    setRoomId(room);

    socket.emit("call-user", { to: id, from: username });
    socket.emit("join-room", room);

    setTimeout(startCall, 1000);
  };

  return (
    <div style={{ background: "#000", height: "100vh", color: "#fff" }}>
      {!username ? (
        <input
          placeholder="Enter name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setUsername(e.target.value);
              socket.emit("join", e.target.value);
            }
          }}
        />
      ) : (
        <div style={{ display: "flex" }}>
          <div style={{ width: 200 }}>
            {Object.entries(users).map(([id, name]) => (
              <div key={id} onClick={() => callUser(id)}>
                {name}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, textAlign: "center" }}>
            <video ref={localVideo} autoPlay muted width="300" />
            <video ref={remoteVideo} autoPlay width="300" />

            <br />

            <button onClick={endCall}>End Call</button>
          </div>
        </div>
      )}
    </div>
  );
}
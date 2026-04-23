import { useState } from "react";
import { auth } from "./firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

export default function Auth({ setUser }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async () => {
    try {
      let res;
      if (isLogin) {
        res = await signInWithEmailAndPassword(auth, email, password);
      } else {
        res = await createUserWithEmailAndPassword(auth, email, password);
      }
      setUser(res.user.email);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-black">
      <div className="bg-[#1a1a1a] p-8 rounded-xl w-80 shadow-lg">

        <h2 className="text-2xl mb-6 text-center text-blue-400">
          {isLogin ? "Login" : "Signup"} - Synkarya
        </h2>

        <input
          type="email"
          placeholder="Email"
          className="w-full mb-3 p-2 bg-black border border-gray-700 rounded"
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full mb-4 p-2 bg-black border border-gray-700 rounded"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleAuth}
          className="w-full bg-blue-500 py-2 rounded hover:bg-blue-600">
          {isLogin ? "Login" : "Signup"}
        </button>

        <p
          className="text-sm text-center mt-4 cursor-pointer text-gray-400"
          onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Create account" : "Already have account?"}
        </p>

      </div>
    </div>
  );
}
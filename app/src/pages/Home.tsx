import { useEffect, useRef } from "react";
import { startGame, stopGame } from "@/game/boot";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) startGame(canvasRef.current);
    return () => stopGame();
  }, []);
  return <main id="game-root"><canvas id="game-canvas" ref={canvasRef} /><div id="ui-overlay" /></main>;
}

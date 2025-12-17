import { useEffect, useState } from "react";
import { Cursor } from "./Cursor";

export function CurrentCursor({ id }: { id: string }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return <Cursor x={mousePos.x} y={mousePos.y} id={id} />;
}


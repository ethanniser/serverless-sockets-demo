import { createRoot } from "react-dom/client";
import { AppWrapper } from "./App";
import "./styles.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<AppWrapper />);

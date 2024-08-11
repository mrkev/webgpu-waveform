import React from "react";
import ReactDOM from "react-dom/client";
import Readme from "./Readme.mdx";
// import "normalize.css";
// import "concrete.css";
import "remixicon/fonts/remixicon.css";
import "./index.css";
import "./modernist.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Readme />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import JamOrderForm from "./form.jsx";
import { ensureZipIndex } from "./zipCache.js";

ensureZipIndex();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <JamOrderForm />
  </React.StrictMode>
);

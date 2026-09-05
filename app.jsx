import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import JamOrderForm from "./form.jsx";
import { RECAPTCHA_SITE_KEY } from "./formspree.js";
import { ensureZipIndex } from "./zipCache.js";

ensureZipIndex();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
      <JamOrderForm />
    </GoogleReCaptchaProvider>
  </React.StrictMode>
);

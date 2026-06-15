import { useEffect, useRef } from "react";
import { RECAPTCHA_SITE_KEY } from "../lib/recaptcha.js";

const RECAPTCHA_SCRIPT_ID = "google-recaptcha-api";
const RECAPTCHA_SCRIPT_SRC = "https://www.google.com/recaptcha/api.js?render=explicit";

let recaptchaScriptPromise = null;

function loadRecaptchaScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("reCAPTCHA can only run in the browser."));
  }
  if (window.grecaptcha?.render) {
    return Promise.resolve(window.grecaptcha);
  }
  if (recaptchaScriptPromise) return recaptchaScriptPromise;

  recaptchaScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(RECAPTCHA_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.grecaptcha), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load reCAPTCHA.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = RECAPTCHA_SCRIPT_ID;
    script.src = RECAPTCHA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha);
    script.onerror = () => reject(new Error("Could not load reCAPTCHA."));
    document.head.appendChild(script);
  });

  return recaptchaScriptPromise;
}

function RecaptchaBox({
  className = "",
  disabled = false,
  onError,
  onExpired,
  onVerify,
  resetKey = 0,
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (disabled || !containerRef.current) return undefined;
    let cancelled = false;

    loadRecaptchaScript()
      .then((grecaptcha) => {
        grecaptcha.ready(() => {
          if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
          widgetIdRef.current = grecaptcha.render(containerRef.current, {
            sitekey: RECAPTCHA_SITE_KEY,
            callback: (token) => onVerify?.(token || ""),
            "expired-callback": () => onExpired?.(),
            "error-callback": () => onError?.(new Error("reCAPTCHA failed to load.")),
          });
        });
      })
      .catch((error) => onError?.(error));

    return () => {
      cancelled = true;
    };
  }, [disabled, onError, onExpired, onVerify]);

  useEffect(() => {
    if (widgetIdRef.current === null || !window.grecaptcha?.reset) return;
    window.grecaptcha.reset(widgetIdRef.current);
  }, [resetKey]);

  return <div className={`recaptcha-box ${className}`.trim()} ref={containerRef} />;
}

export default RecaptchaBox;

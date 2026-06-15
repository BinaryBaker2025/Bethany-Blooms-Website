import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase.js";

export const RECAPTCHA_SITE_KEY = "6LemCCEtAAAAAIcn1A4QFvsp_higlgkTk7ri6r7Y";

export const verifyRecaptchaChallenge = async ({ token = "", action = "auth" } = {}) => {
  const normalizedToken = (token || "").toString().trim();
  if (!normalizedToken) {
    throw new Error("Complete the reCAPTCHA check first.");
  }

  const verifyRecaptchaToken = httpsCallable(getFirebaseFunctions(), "verifyRecaptchaToken");
  await verifyRecaptchaToken({
    token: normalizedToken,
    action: (action || "auth").toString().trim(),
  });
};

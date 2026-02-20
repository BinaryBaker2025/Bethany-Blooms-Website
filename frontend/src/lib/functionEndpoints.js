const FUNCTIONS_REGION = "us-central1";
const DEFAULT_FUNCTIONS_PROJECT_ID = "bethanyblooms-89dcc";

function normalizeBaseUrl(value = "") {
  return (value || "").toString().trim().replace(/\/+$/, "");
}

function parseBooleanEnv(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function getFunctionsProjectId() {
  return (
    (import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FUNCTIONS_PROJECT_ID)
      .toString()
      .trim() || DEFAULT_FUNCTIONS_PROJECT_ID
  );
}

function getFunctionsRouting() {
  const projectId = getFunctionsProjectId();
  const cloudFunctionsBase = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
  const emulatorBase = `http://127.0.0.1:5001/${projectId}/${FUNCTIONS_REGION}`;

  const explicitBaseOverride = normalizeBaseUrl(import.meta.env.VITE_FUNCTIONS_BASE_URL);
  if (explicitBaseOverride) {
    return {
      baseUrl: explicitBaseOverride,
      cloudFunctionsBase,
      emulatorBase,
      usingLocalEmulator: false,
      hasExplicitBaseOverride: true,
    };
  }

  const useLocalFunctions = parseBooleanEnv(import.meta.env.VITE_USE_LOCAL_FUNCTIONS);
  if (useLocalFunctions === true) {
    return {
      baseUrl: emulatorBase,
      cloudFunctionsBase,
      emulatorBase,
      usingLocalEmulator: true,
      hasExplicitBaseOverride: false,
    };
  }
  if (useLocalFunctions === false) {
    return {
      baseUrl: cloudFunctionsBase,
      cloudFunctionsBase,
      emulatorBase,
      usingLocalEmulator: false,
      hasExplicitBaseOverride: false,
    };
  }

  return {
    baseUrl: cloudFunctionsBase,
    cloudFunctionsBase,
    emulatorBase,
    usingLocalEmulator: false,
    hasExplicitBaseOverride: false,
  };
}

function buildFunctionEndpoint(baseUrl, functionName) {
  const name = (functionName || "").toString().trim();
  if (!name) {
    throw new Error("Function endpoint name is required.");
  }
  return `${normalizeBaseUrl(baseUrl)}/${name}`;
}

export function getFunctionsBaseUrl() {
  return getFunctionsRouting().baseUrl;
}

export function getFunctionEndpoint(functionName) {
  return buildFunctionEndpoint(getFunctionsBaseUrl(), functionName);
}

export function getCloudFunctionEndpoint(functionName) {
  return buildFunctionEndpoint(getFunctionsRouting().cloudFunctionsBase, functionName);
}

export function getFunctionEndpointFallback(functionName) {
  const routing = getFunctionsRouting();
  if (!routing.usingLocalEmulator || routing.hasExplicitBaseOverride) {
    return null;
  }
  return buildFunctionEndpoint(routing.cloudFunctionsBase, functionName);
}

export const PAYFAST_PAYMENT_FUNCTION_ENDPOINT = getFunctionEndpoint(
  "createPayfastPaymentHttp",
);
export const PAYFAST_PAYMENT_FUNCTION_FALLBACK_ENDPOINT = getFunctionEndpointFallback(
  "createPayfastPaymentHttp",
);
export const EFT_ORDER_FUNCTION_ENDPOINT = getFunctionEndpoint("createEftOrderHttp");
export const EFT_ORDER_FUNCTION_FALLBACK_ENDPOINT = getFunctionEndpointFallback(
  "createEftOrderHttp",
);
export const SUBSCRIPTION_PAYFAST_PAYMENT_FUNCTION_ENDPOINT = getFunctionEndpoint(
  "createSubscriptionPayfastPaymentHttp",
);

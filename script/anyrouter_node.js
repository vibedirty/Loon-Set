const DEFAULT_UPSTREAM = "https://anyrouter.top";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";
const XOR_KEY = "3000176000856006061501533003690027800375";
const UNSBOX_TABLE = [
  15, 35, 29, 24, 33, 16, 1, 38, 10, 9,
  19, 31, 40, 27, 22, 23, 25, 13, 6, 11,
  39, 18, 20, 8, 14, 21, 32, 26, 2, 30,
  7, 4, 17, 5, 3, 28, 34, 37, 12, 36,
];

const upstream = String(process.env.ANYROUTER_UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, "");
const sessionCookie = process.env.ANYROUTER_COOKIE || "";
const userId = process.env.ANYROUTER_USER || "";

function computeAcwCookie(arg1) {
  const unsboxed = UNSBOX_TABLE.map((index) => arg1[index - 1]).join("");
  let value = "";

  for (let i = 0; i < 40; i += 2) {
    const a = parseInt(unsboxed.slice(i, i + 2), 16);
    const b = parseInt(XOR_KEY.slice(i, i + 2), 16);
    value += ((a ^ b).toString(16)).padStart(2, "0");
  }

  return `acw_sc__v2=${value}`;
}

async function getArg1() {
  const url = `${upstream}/api/user/self`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Host: "anyrouter.top",
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Cookie: sessionCookie,
      "New-API-User": userId,
    },
    redirect: "manual",
  });

  const text = await response.text();
  const match = text.match(/var\s+arg1\s*=\s*['"]([0-9a-fA-F]{40})['"]/);
  if (!match) {
    throw new Error(`arg1 not found from ${url}, HTTP ${response.status}, body=${text.slice(0, 200)}`);
  }

  return match[1];
}

async function getDynamicCookie() {
  const arg1 = await getArg1();
  return computeAcwCookie(arg1);
}

async function main() {
  if (!sessionCookie || !/^session=/.test(sessionCookie) || !userId) {
    console.error("Missing env vars:");
    console.error("  ANYROUTER_COOKIE='session=...;' ANYROUTER_USER='141010' node script/anyrouter_node.js");
    process.exit(1);
  }

  const dynamicCookie = await getDynamicCookie();
  console.log("dynamic cookie:", dynamicCookie);

  const response = await fetch(`${upstream}/api/user/sign_in`, {
    method: "POST",
    headers: {
      Host: "anyrouter.top",
      Connection: "keep-alive",
      "New-API-User": userId,
      "Cache-Control": "no-store",
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Origin: upstream,
      Referer: `${upstream}/`,
      "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
      Cookie: `${dynamicCookie}; ${sessionCookie}`,
    },
  });

  const bodyText = await response.text();

  console.log("status:", response.status);
  console.log("headers:", JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
  console.log("body:");
  console.log(bodyText || "<empty>");

  try {
    const json = JSON.parse(bodyText);
    console.log("json:", JSON.stringify(json, null, 2));
  } catch (error) {
    console.error("json parse error:", error.message);
  }
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});

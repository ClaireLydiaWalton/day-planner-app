import { openUrl } from "@tauri-apps/plugin-opener";

const githubLink = document.querySelector<HTMLAnchorElement>("#github-link");

githubLink?.addEventListener("click", async (event) => {
  event.preventDefault();

  try {
    await openUrl(githubLink.href);
  } catch {
    window.open(githubLink.href, "_blank", "noopener,noreferrer");
  }
});

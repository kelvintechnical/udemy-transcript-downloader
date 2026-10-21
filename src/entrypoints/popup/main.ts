import { browser } from 'wxt/browser';
const button = document.querySelector<HTMLButtonElement>('#open-queue')!;
button.addEventListener('click', async () => {
  await browser.tabs.create({ url: browser.runtime.getURL('/queue.html') });
  window.close();
});

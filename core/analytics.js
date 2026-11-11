// Google Analytics, for the site's owner to count visits to each page, on every page of the site. Google's tag says a
// page was opened, and nothing from this site goes with it: never anything from the camera, nor about how a child
// plays. Google signals and ad personalisation are off, as this is a site for children. On this computer, as in the
// tests, it isn't loaded at all, so nothing leaves it. Each page's security policy lets Google's tag in.
(() => {
  const ID = 'G-BPC62S5T34';
  if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // Google's tag reads each call as it was made, so it's pushed just as it came.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.append(tag);
})();

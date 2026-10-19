// The app moved to lifequestapp.pages.dev. Anyone arriving at the old address
// (old links, home-screen icons) is sent to the same page on the new one.
const OLD = 'life-quest-7qp.pages.dev';
const NEW = 'lifequestapp.pages.dev';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === OLD) {
    url.hostname = NEW;
    return Response.redirect(url.toString(), 301);
  }
  return next();
}

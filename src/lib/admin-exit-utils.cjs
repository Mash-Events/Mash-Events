function normalizeAdminExitTarget(target) {
  const value = String(target || '').trim();

  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
}

function isAdminPath(pathname) {
  const value = normalizeAdminExitTarget(pathname);
  return value === '/admin' || value.startsWith('/admin/');
}

function shouldAutoSignOutAdminNavigation(currentPathname, nextPathname) {
  return isAdminPath(currentPathname) && !isAdminPath(nextPathname);
}

module.exports = {
  normalizeAdminExitTarget,
  shouldAutoSignOutAdminNavigation,
};

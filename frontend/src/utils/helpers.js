export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
  }).format(amount || 0);
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function getInitials(name) {
  return name
    ?.split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export function calculateProgress(start, end) {
  const now = new Date();
  const startDate = new Date(start);
  const endDate = new Date(end);
  const total = endDate - startDate;
  const elapsed = now - startDate;
  return Math.min(Math.max(Math.round((elapsed / total) * 100), 0), 100);
}

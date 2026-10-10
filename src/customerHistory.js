export const CUSTOMER_HISTORY_KEY = "quotationCustomerHistory";
const LIMIT = 100;
const clean = (value) => (typeof value === "string" ? value.trim() : "");

export function normalizeHistory(saved) {
  const companies = [
    ...new Set(
      (Array.isArray(saved?.companies) ? saved.companies : [])
        .map(clean)
        .filter(Boolean),
    ),
  ].slice(0, LIMIT);
  const contacts = [];
  for (const item of Array.isArray(saved?.contacts) ? saved.contacts : []) {
    const contact = {
      name: clean(item?.name),
      phone: clean(item?.phone),
      company: clean(item?.company),
    };
    if (!contact.name || !contact.phone) continue;
    if (
      !contacts.some(
        (entry) =>
          entry.name === contact.name &&
          entry.phone === contact.phone &&
          entry.company === contact.company,
      )
    )
      contacts.push(contact);
    if (contacts.length === LIMIT) break;
  }
  return { companies, contacts };
}

export function rememberCustomer(history, data) {
  const previous = normalizeHistory(history);
  const company = clean(data.quotationAccepter);
  const name = clean(data.quotationAccepterName);
  const phone = clean(data.quotationAccepterPhone);
  return {
    companies: company
      ? [
          company,
          ...previous.companies.filter((item) => item !== company),
        ].slice(0, LIMIT)
      : previous.companies,
    contacts:
      name && phone
        ? [
            { name, phone, company },
            ...previous.contacts.filter(
              (item) =>
                item.name !== name ||
                item.phone !== phone ||
                item.company !== company,
            ),
          ].slice(0, LIMIT)
        : previous.contacts,
  };
}

export function loadCustomerHistory(data) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(CUSTOMER_HISTORY_KEY) || "null");
  } catch {
    saved = null;
  }
  return rememberCustomer(normalizeHistory(saved), data);
}

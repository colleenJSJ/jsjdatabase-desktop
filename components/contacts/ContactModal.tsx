'use client';

import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  ContactFormValues,
  ContactModalFieldVisibilityMap,
  ContactModalLabelOverrides,
  ContactModalProps,
  ContactModalContextDefaults,
} from './contact-types';

const baseClass =
  'block w-full rounded-md border border-white/10 bg-background-primary px-3 py-2 text-sm text-text-primary shadow-sm focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/10';
const labelClass = 'block text-sm font-medium text-text-primary';
const helperClass = 'text-xs text-text-muted/70';

const normaliseStringList = (
  values?: string[] | null,
  { ensureEntry = false }: { ensureEntry?: boolean } = {}
): string[] => {
  const cleaned = Array.isArray(values)
    ? values
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(item => item.length > 0)
    : [];
  if (!ensureEntry) {
    return cleaned;
  }
  return cleaned.length > 0 ? cleaned : [''];
};

const buildInitialValues = (
  defaults: ContactModalContextDefaults | undefined,
  initial: Partial<ContactFormValues> | undefined
): ContactFormValues => {
  const relatedDefaults = defaults?.relatedToIds ?? [];
  const assignedDefaults = defaults?.assignedEntityIds ?? [];
  const petDefaults = defaults?.petIds ?? [];

  return {
    id: initial?.id,
    name: initial?.name || '',
    company: initial?.company || '',
    emails: normaliseStringList(initial?.emails ?? null, { ensureEntry: true }),
    phones: normaliseStringList(initial?.phones ?? null, { ensureEntry: true }),
    addresses: normaliseStringList(initial?.addresses ?? null, { ensureEntry: true }),
    website: initial?.website || '',
    notes: initial?.notes || '',
    tags: dedupeAndClean(initial?.tags ? [...initial.tags] : []),
    related_to: initial?.related_to ? [...initial.related_to] : [...relatedDefaults],
    category: initial?.category ?? defaults?.category,
    source_type: initial?.source_type ?? defaults?.sourceType,
    source_page: initial?.source_page ?? defaults?.sourcePage,
    contact_type: initial?.contact_type ?? defaults?.contactType,
    contact_subtype: initial?.contact_subtype ?? defaults?.contactSubtype,
    assigned_entities: initial?.assigned_entities ? [...initial.assigned_entities] : [...assignedDefaults],
    pets: initial?.pets ? [...initial.pets] : [...petDefaults],
    trip_id: initial?.trip_id ?? null,
    portal_url: initial?.portal_url || '',
    portal_username: initial?.portal_username || '',
    portal_password: initial?.portal_password || '',
    is_favorite: initial?.is_favorite ?? defaults?.isFavorite ?? false,
    is_emergency: initial?.is_emergency ?? defaults?.isEmergency ?? false,
    is_preferred: initial?.is_preferred ?? defaults?.isPreferred ?? false,
    accepted_emergencies: initial?.accepted_emergencies ?? undefined,
    accepts_emergencies: initial?.accepts_emergencies ?? undefined,
    preferred_for_emergencies: initial?.preferred_for_emergencies ?? undefined,
    metadata: initial?.metadata ? { ...initial.metadata } : undefined,
  };
};

const fieldHidden = (map: ContactModalFieldVisibilityMap | undefined, key: keyof ContactModalFieldVisibilityMap) => {
  return map?.[key]?.hidden ?? false;
};

const fieldRequired = (map: ContactModalFieldVisibilityMap | undefined, key: keyof ContactModalFieldVisibilityMap, fallback = false) => {
  return map?.[key]?.required ?? fallback;
};

const getLabel = (
  labels: ContactModalLabelOverrides | undefined,
  key: keyof ContactModalLabelOverrides,
  fallback: string
) => labels?.[key] ?? fallback;

const appendEmpty = (list: string[]) => [...list, ''];

const updateListValue = (list: string[], index: number, value: string) => {
  return list.map((item, idx) => (idx === index ? value : item));
};

const removeIndex = (list: string[], index: number) => {
  return list.filter((_, idx) => idx !== index);
};

const dedupeAndClean = (values: string[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  values
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => {
      if (!seen.has(value)) {
        seen.add(value);
        output.push(value);
      }
    });
  return output;
};

export function ContactModal({
  open,
  mode,
  initialValues,
  defaults,
  visibility,
  labels,
  optionSelectors,
  extraSections,
  renderCustomFields,
  footerContent,
  busy = false,
  canSubmit = true,
  submitLabel,
  cancelLabel,
  onSubmit,
  onCancel,
}: ContactModalProps) {
  const [formValues, setFormValues] = useState<ContactFormValues>(() => buildInitialValues(defaults, initialValues));

  useEffect(() => {
    if (!open) return;
    setFormValues(buildInitialValues(defaults, initialValues));
  }, [open, defaults, initialValues]);

  const categories = optionSelectors?.categories ?? [];
  const relatedEntities = optionSelectors?.relatedEntities ?? [];
  const assignedOptions = optionSelectors?.assignedEntities ?? [];
  const availableTags = optionSelectors?.tags ?? [];

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setFormValues(prev => ({
      ...prev,
      tags: dedupeAndClean([...prev.tags, trimmed])
    }));
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      const target = event.target as HTMLInputElement;
      addTag(target.value);
      target.value = '';
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormValues(prev => ({
      ...prev,
      tags: prev.tags.filter(value => value !== tag)
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !canSubmit) return;
    const cleaned: ContactFormValues = {
      ...formValues,
      emails: dedupeAndClean(formValues.emails),
      phones: dedupeAndClean(formValues.phones),
      addresses: dedupeAndClean(formValues.addresses),
      tags: dedupeAndClean(formValues.tags),
      related_to: Array.from(new Set(formValues.related_to)),
      assigned_entities: Array.from(new Set(formValues.assigned_entities)),
      pets: Array.from(new Set(formValues.pets)),
    };
    await onSubmit(cleaned);
  };

  if (!open) {
    return null;
  }

  const showEmails = !fieldHidden(visibility, 'emails');
  const showPhones = !fieldHidden(visibility, 'phones');
  const showAddresses = !fieldHidden(visibility, 'addresses');
  const showCompany = !fieldHidden(visibility, 'company');
  const showWebsite = !fieldHidden(visibility, 'website');
  const showPortal = !fieldHidden(visibility, 'portal');
  const showNotes = !fieldHidden(visibility, 'notes');
  const showTags = !fieldHidden(visibility, 'tags');
  const showRelated = !fieldHidden(visibility, 'relatedTo');
  const showCategory = !fieldHidden(visibility, 'category');
  const showFavoriteToggle = !fieldHidden(visibility, 'favorite');
  const showEmergencyToggle = !fieldHidden(visibility, 'emergency');
  const showPreferredToggle = !fieldHidden(visibility, 'preferred');
  const showAssigned = !fieldHidden(visibility, 'assignedEntities');

  const applyFormValues = (
    next: Partial<ContactFormValues> | ((prev: ContactFormValues) => Partial<ContactFormValues>)
  ) => {
    setFormValues(prev => ({
      ...prev,
      ...(typeof next === 'function' ? next(prev) : next),
    }));
  };

  const customFields = renderCustomFields
    ? renderCustomFields({ values: formValues, setValues: applyFormValues })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-background-secondary shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white/90">
              {mode === 'edit' ? 'Edit Contact' : 'Add Contact'}
            </h2>
            {formValues.category && (
              <p className="text-xs text-text-muted/70">Category: {formValues.category}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-text-muted transition hover:bg-white/5 hover:text-white"
            aria-label="Close contact modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid max-h-[80vh] grid-cols-1 gap-x-6 overflow-y-auto px-6 py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={labelClass}>
                {getLabel(labels, 'nameLabel', 'Name')} <span className="text-rose-400">*</span>
              </label>
              <input
                className={baseClass}
                value={formValues.name}
                onChange={event => setFormValues(prev => ({ ...prev, name: event.target.value }))}
                placeholder="Full name"
                required
              />
            </div>

            {showCompany && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'companyLabel', 'Company')}</label>
                <input
                  className={baseClass}
                  value={formValues.company ?? ''}
                  onChange={event => setFormValues(prev => ({ ...prev, company: event.target.value }))}
                  placeholder="Organization or practice"
                />
              </div>
            )}

            {showCategory && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'categoryLabel', 'Category')}</label>
                <select
                  className={baseClass}
                  value={formValues.category ?? ''}
                  onChange={event => setFormValues(prev => ({ ...prev, category: event.target.value || undefined }))}
                >
                  <option value="">Uncategorized</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            )}

            {showTags && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'tagsLabel', 'Tags')}</label>
                <input
                  className={baseClass}
                  placeholder="Press enter to add a tag"
                  onKeyDown={handleTagKeyDown}
                />
                {availableTags.length > 0 && (
                  <p className={helperClass}>Suggestions: {availableTags.join(', ')}</p>
                )}
                {formValues.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formValues.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80">
                        {tag}
                        <button type="button" onClick={() => handleRemoveTag(tag)} className="text-text-muted/70 hover:text-white">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {customFields}

            {showRelated && relatedEntities.length > 0 && (
              <div className="space-y-3">
                <label className={labelClass}>{getLabel(labels, 'relatedToLabel', 'Related To')}</label>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-background-primary/60 p-3">
                  {relatedEntities.map(entity => {
                    const checked = formValues.related_to.includes(entity.id);
                    return (
                      <label key={entity.id} className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={event => {
                            const next = event.target.checked
                              ? [...formValues.related_to, entity.id]
                              : formValues.related_to.filter(id => id !== entity.id);
                            setFormValues(prev => ({ ...prev, related_to: next }));
                          }}
                          className="h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        {entity.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {showAssigned && assignedOptions.length > 0 && (
              <div className="space-y-3">
                <label className={labelClass}>{getLabel(labels, 'assignedEntitiesLabel', 'Assigned Entities')}</label>
                <div className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-background-primary/60 p-3">
                  {assignedOptions.map(entity => {
                    const checked = formValues.assigned_entities.includes(entity.id);
                    return (
                      <label key={entity.id} className="flex items-center gap-2 text-sm text-text-primary">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={event => {
                            const next = event.target.checked
                              ? [...formValues.assigned_entities, entity.id]
                              : formValues.assigned_entities.filter(id => id !== entity.id);
                            setFormValues(prev => ({ ...prev, assigned_entities: next }));
                          }}
                          className="h-4 w-4 rounded border-white/20 bg-transparent"
                        />
                        {entity.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {showNotes && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'notesLabel', 'Notes')}</label>
                <textarea
                  className={`${baseClass} min-h-[120px]`}
                  value={formValues.notes ?? ''}
                  onChange={event => setFormValues(prev => ({ ...prev, notes: event.target.value }))}
                  placeholder="Important context, instructions, or history"
                />
              </div>
            )}

            {extraSections}
          </div>

          <div className="space-y-4">
            {showEmails && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'emailsLabel', 'Email Addresses')}</label>
                <div className="space-y-2">
                  {formValues.emails.map((value, index) => (
                    <div key={`email-${index}`} className="flex items-center gap-2">
                      <input
                        className={baseClass}
                        value={value}
                        onChange={event => setFormValues(prev => ({
                          ...prev,
                          emails: updateListValue(prev.emails, index, event.target.value)
                        }))}
                        type="email"
                        placeholder="contact@example.com"
                        required={index === 0 && fieldRequired(visibility, 'emails', false)}
                      />
                      <button
                        type="button"
                        className="rounded-full border border-white/10 p-2 text-text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                        onClick={() => setFormValues(prev => {
                          const next = removeIndex(prev.emails, index);
                          return {
                            ...prev,
                            emails: next.length > 0 ? next : [''],
                          };
                        })}
                        aria-label="Remove email"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormValues(prev => ({ ...prev, emails: appendEmpty(prev.emails) }))}
                    className="inline-flex items-center gap-2 text-xs font-medium text-primary-300 transition hover:text-primary-100"
                  >
                    <Plus className="h-3 w-3" /> Add email
                  </button>
                </div>
              </div>
            )}

            {showPhones && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'phonesLabel', 'Phone Numbers')}</label>
                <div className="space-y-2">
                  {formValues.phones.map((value, index) => (
                    <div key={`phone-${index}`} className="flex items-center gap-2">
                      <input
                        className={baseClass}
                        value={value}
                        onChange={event => setFormValues(prev => ({
                          ...prev,
                          phones: updateListValue(prev.phones, index, event.target.value)
                        }))}
                        placeholder="(555) 123-4567"
                        required={index === 0 && fieldRequired(visibility, 'phones', false)}
                      />
                      <button
                        type="button"
                        className="rounded-full border border-white/10 p-2 text-text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                        onClick={() => setFormValues(prev => {
                          const next = removeIndex(prev.phones, index);
                          return {
                            ...prev,
                            phones: next.length > 0 ? next : [''],
                          };
                        })}
                        aria-label="Remove phone"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormValues(prev => ({ ...prev, phones: appendEmpty(prev.phones) }))}
                    className="inline-flex items-center gap-2 text-xs font-medium text-primary-300 transition hover:text-primary-100"
                  >
                    <Plus className="h-3 w-3" /> Add phone
                  </button>
                </div>
              </div>
            )}

            {showAddresses && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'addressesLabel', 'Addresses')}</label>
                <div className="space-y-2">
                  {formValues.addresses.map((value, index) => (
                    <div key={`address-${index}`} className="flex items-center gap-2">
                      <input
                        className={baseClass}
                        value={value}
                        onChange={event => setFormValues(prev => ({
                          ...prev,
                          addresses: updateListValue(prev.addresses, index, event.target.value)
                        }))}
                        placeholder="Street, City, State"
                      />
                      <button
                        type="button"
                        className="rounded-full border border-white/10 p-2 text-text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                        onClick={() => setFormValues(prev => {
                          const next = removeIndex(prev.addresses, index);
                          return {
                            ...prev,
                            addresses: next.length > 0 ? next : [''],
                          };
                        })}
                        aria-label="Remove address"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormValues(prev => ({ ...prev, addresses: appendEmpty(prev.addresses) }))}
                    className="inline-flex items-center gap-2 text-xs font-medium text-primary-300 transition hover:text-primary-100"
                  >
                    <Plus className="h-3 w-3" /> Add address
                  </button>
                </div>
              </div>
            )}

            {showWebsite && (
              <div className="space-y-2">
                <label className={labelClass}>{getLabel(labels, 'websiteLabel', 'Website')}</label>
                <input
                  className={baseClass}
                  value={formValues.website ?? ''}
                  onChange={event => setFormValues(prev => ({ ...prev, website: event.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            )}

            {showPortal && (
              <div className="space-y-2 rounded-lg border border-white/10 bg-background-primary/60 p-3">
                <p className="text-sm font-medium text-text-primary">{getLabel(labels, 'portalLabel', 'Portal Access')}</p>
                <div className="space-y-2">
                  <input
                    className={baseClass}
                    value={formValues.portal_url ?? ''}
                    onChange={event => setFormValues(prev => ({ ...prev, portal_url: event.target.value }))}
                    placeholder="Portal URL"
                  />
                  <input
                    className={baseClass}
                    value={formValues.portal_username ?? ''}
                    onChange={event => setFormValues(prev => ({ ...prev, portal_username: event.target.value }))}
                    placeholder="Portal username"
                  />
                  <input
                    className={baseClass}
                    value={formValues.portal_password ?? ''}
                    onChange={event => setFormValues(prev => ({ ...prev, portal_password: event.target.value }))}
                    placeholder="Portal password"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              {showFavoriteToggle && (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={Boolean(formValues.is_favorite)}
                    onChange={event => setFormValues(prev => ({ ...prev, is_favorite: event.target.checked }))}
                    className="h-4 w-4 rounded border-white/20"
                  />
                  {getLabel(labels, 'favoriteLabel', 'Mark as favorite')}
                </label>
              )}
              {showEmergencyToggle && (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={Boolean(formValues.is_emergency)}
                    onChange={event => setFormValues(prev => ({ ...prev, is_emergency: event.target.checked }))}
                    className="h-4 w-4 rounded border-white/20"
                  />
                  {getLabel(labels, 'emergencyLabel', 'Emergency contact')}
                </label>
              )}
              {showPreferredToggle && (
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={Boolean(formValues.is_preferred)}
                    onChange={event => setFormValues(prev => ({ ...prev, is_preferred: event.target.checked }))}
                    className="h-4 w-4 rounded border-white/20"
                  />
                  {getLabel(labels, 'preferredLabel', 'Preferred contact')}
                </label>
              )}
            </div>

            {footerContent}
          </div>

          <div className="md:col-span-2">
            <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-4 md:flex-row md:items-center md:justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center justify-center rounded-md border border-white/10 bg-transparent px-4 py-2 text-sm font-medium text-text-muted transition hover:border-white/20 hover:text-white"
              >
                {cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busy || !canSubmit || !formValues.name.trim()}
                className="inline-flex items-center justify-center rounded-md bg-button-create px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-gray-600"
              >
                {busy ? 'Saving…' : submitLabel ?? (mode === 'edit' ? 'Save changes' : 'Create contact')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Pull the audit fields out of the request itself. Never take these from the
 * request body -- the point of recording them is that the client cannot choose
 * what its own acceptance record says.
 */
export function requestClientInfo(request: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded
    ? forwarded.split(',')[0].trim()
    : request.headers.get('x-real-ip');

  return { ip: ip || null, userAgent: request.headers.get('user-agent') || null };
}

type AcceptanceInput = {
  creatorId: string;
  userId?: string | null;
  email?: string | null;
  documentKey: string;
  version: string;
  source: 'invite_signup' | 'portal_gate';
  ip: string | null;
  userAgent: string | null;
};

/**
 * Write one clickwrap record for one document. Requires a service-role client
 * -- creators have no INSERT policy on this table by design.
 *
 * Returns null on success. A unique-constraint hit means this creator already
 * accepted this version of this document, which is the desired end state, so it
 * counts as success rather than an error.
 */
export async function recordTermsAcceptance(
  // The service-role client is untyped in this codebase (creators and friends
  // are absent from src/types/database.ts), matching every other creator route.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  { creatorId, userId, email, documentKey, version, source, ip, userAgent }: AcceptanceInput
): Promise<{ message: string } | null> {
  const { error } = await supabase.from('creator_terms_acceptances').insert({
    creator_id: creatorId,
    user_id: userId ?? null,
    creator_email: email ?? null,
    document_key: documentKey,
    document_version: version,
    source,
    ip_address: ip,
    user_agent: userAgent,
  });

  if (error && error.code !== '23505') return error;
  return null;
}

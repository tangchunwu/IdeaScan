import { supabase } from "@/integrations/supabase/client";

export interface MVPContent {
	hero: {
		title: string;
		subtitle: string;
		cta: string;
		image?: string;
	};
	features: {
		title: string;
		description: string;
		icon: string;
	}[];
	painPoints: {
		problem: string;
		solution: string;
	}[];
	testimonials: {
		name: string;
		role: string;
		quote: string;
		avatar?: string;
	}[];
	faq: {
		question: string;
		answer: string;
	}[];
}

export interface MVPLandingPage {
	id: string;
	user_id: string;
	validation_id: string | null;
	slug: string;
	content: MVPContent;
	theme: string;
	is_published: boolean;
	view_count: number;
	created_at: string;
	updated_at: string;
}

// Type-safe wrapper for tables not in generated types
const fromTable = (table: string) => supabase.from(table as any);

function getOrCreateAnonId(): string {
	const key = "idea_scan_anon_id";
	const existing = localStorage.getItem(key);
	if (existing) return existing;
	const next = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 64);
	localStorage.setItem(key, next);
	return next;
}

const EVENT_THROTTLE_MS = 5000;
const eventLastSentAt = new Map<string, number>();

export async function generateMVP(validationId: string): Promise<MVPLandingPage> {
	const { data, error } = await supabase.functions.invoke('generate-mvp', {
		body: { validationId },
	});

	if (error) throw error;
	return data;
}

export async function getMVPBySlug(slug: string): Promise<MVPLandingPage | null> {
	const { data, error } = await fromTable('mvp_landing_pages')
		.select('*')
		.eq('slug', slug)
		.single();

	if (error) {
		if (error.code === 'PGRST116') return null; // Not found
		throw error;
	}

	return data as unknown as MVPLandingPage;
}

export async function updateMVP(id: string, updates: Partial<MVPLandingPage>): Promise<MVPLandingPage> {
	const { data, error } = await fromTable('mvp_landing_pages')
		.update(updates)
		.eq('id', id)
		.select()
		.single();

	if (error) throw error;
	return data as unknown as MVPLandingPage;
}

export async function publishMVP(id: string, isPublished: boolean): Promise<void> {
	const { error } = await fromTable('mvp_landing_pages')
		.update({ is_published: isPublished })
		.eq('id', id);

	if (error) throw error;
}

export async function collectLead(landingPageId: string, email: string): Promise<void> {
	// Client-side email validation
	const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	if (!email || typeof email !== 'string' || email.length > 254 || !emailRegex.test(email)) {
		throw new Error('Invalid email address');
	}

	const { data, error } = await supabase.functions.invoke('submit-mvp-lead', {
		body: {
			landingPageId,
			email: email.toLowerCase().trim(),
			anonId: getOrCreateAnonId(),
			sessionId: window.location.pathname,
			metadata: {
				source: 'web_form',
				user_agent: navigator.userAgent.slice(0, 200),
			},
		},
	});

	if (error) throw error;
	if (!data?.success) {
		throw new Error(data?.error || 'Lead submit failed');
	}
}

export async function trackExperimentEvent(
	landingPageId: string,
	eventType: 'view' | 'cta_click' | 'checkout_start' | 'paid_intent' | 'waitlist_submit',
	metadata?: Record<string, unknown>
): Promise<void> {
	try {
		const now = Date.now();
		const eventKey = `${landingPageId}:${eventType}`;
		const lastSent = eventLastSentAt.get(eventKey) || 0;
		if (now - lastSent < EVENT_THROTTLE_MS) {
			return;
		}
		eventLastSentAt.set(eventKey, now);

		await supabase.functions.invoke('track-experiment-event', {
			body: {
				landingPageId,
				eventType,
				anonId: getOrCreateAnonId(),
				sessionId: window.location.pathname,
				metadata: metadata || {},
			},
		});
	} catch {
		// non-blocking analytics path
	}
}

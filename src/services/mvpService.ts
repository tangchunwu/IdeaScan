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

	// Check rate limit from localStorage (client-side protection)
	const rateLimitKey = `lead_submit_${landingPageId}`;
	const lastSubmits = JSON.parse(localStorage.getItem(rateLimitKey) || '[]') as number[];
	const now = Date.now();
	const oneHourAgo = now - (60 * 60 * 1000);
	const recentSubmits = lastSubmits.filter(t => t > oneHourAgo);
	
	if (recentSubmits.length >= 3) {
		throw new Error('Too many submissions. Please try again later.');
	}

	const { error } = await fromTable('mvp_leads')
		.insert({
			landing_page_id: landingPageId,
			email: email.toLowerCase().trim(),
			metadata: { source: 'web_form', user_agent: navigator.userAgent.slice(0, 200) }
		});

	if (error) throw error;

	// Update client-side rate limit
	recentSubmits.push(now);
	localStorage.setItem(rateLimitKey, JSON.stringify(recentSubmits));
}

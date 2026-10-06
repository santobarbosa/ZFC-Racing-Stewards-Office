import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...corsHeaders, 'Content-Type': 'application/json' },
	});
}

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
	if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

	const authorization = request.headers.get('Authorization');
	const token = authorization?.replace(/^Bearer\s+/i, '');
	const supabaseUrl = Deno.env.get('SUPABASE_URL');
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
	const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	const appUrl = Deno.env.get('APP_URL');
	if (!token || !supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
		return jsonResponse({ error: 'Server configuration or login is missing' }, 500);
	}

	const callerClient = createClient(supabaseUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { headers: { Authorization: `Bearer ${token}` } },
	});
	const { data: callerResult, error: callerError } = await callerClient.auth.getUser(token);
	if (callerError || !callerResult.user?.email_confirmed_at) {
		return jsonResponse({ error: 'A confirmed account is required' }, 401);
	}

	const adminClient = createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	const { data: callerProfile, error: profileError } = await adminClient
		.from('zfc_user_profiles')
		.select('access_tier')
		.eq('id', callerResult.user.id)
		.single();
	if (profileError || Number(callerProfile?.access_tier) < 3) {
		return jsonResponse({ error: 'Tier 3 access required' }, 403);
	}

	let input: { email?: string; displayName?: string; position?: string; accessTier?: number };
	try {
		input = await request.json();
	} catch {
		return jsonResponse({ error: 'Invalid JSON body' }, 400);
	}
	const email = input.email?.trim().toLowerCase() || '';
	const displayName = input.displayName?.trim() || '';
	const position = input.position?.trim() || '';
	const accessTier = Number(input.accessTier);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Valid email is required' }, 400);
	if (!displayName || displayName.length > 100 || !position || position.length > 100) {
		return jsonResponse({ error: 'Name and position are required' }, 400);
	}
	if (![1, 2, 3].includes(accessTier)) return jsonResponse({ error: 'Tier must be 1, 2, or 3' }, 400);

	const redirectTo = new URL(appUrl);
	redirectTo.searchParams.set('flow', 'set-password');
	const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
		data: { display_name: displayName },
		redirectTo: redirectTo.toString(),
	});
	if (inviteError || !invited.user) {
		return jsonResponse({ error: inviteError?.message || 'Invitation could not be created' }, 400);
	}

	const { error: updateError } = await adminClient
		.from('zfc_user_profiles')
		.update({ display_name: displayName, position, access_tier: accessTier, updated_at: new Date().toISOString() })
		.eq('id', invited.user.id);
	if (updateError) {
		await adminClient.auth.admin.deleteUser(invited.user.id);
		return jsonResponse({ error: 'Invitation profile could not be configured' }, 500);
	}

	return jsonResponse({ user: { id: invited.user.id, email, displayName, position, accessTier } }, 201);
});
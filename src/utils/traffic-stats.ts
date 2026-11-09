export interface TrafficSample {
	at: string;
	pv: number;
}
export interface TrafficHistory {
	version: 1;
	startedAt: string;
	resetAt?: string;
	samples: TrafficSample[];
}
export interface TrafficWindow {
	samples: TrafficSample[];
	views: number | null;
	coveredHours: number;
	partial: boolean;
	maxGapHours: number;
}
export function parseTrafficHistory(input: unknown): TrafficHistory {
	if (!input || typeof input !== "object") throw new Error("Invalid history");
	const data = input as TrafficHistory;
	if (
		data.version !== 1 ||
		!Number.isFinite(Date.parse(data.startedAt)) ||
		!Array.isArray(data.samples) ||
		data.samples.length === 0 ||
		data.samples.length > 2000
	)
		throw new Error("Invalid history");
	let previousTime = Number.NEGATIVE_INFINITY;
	let previousCount = -1;
	for (const sample of data.samples) {
		const time = Date.parse(sample.at);
		if (
			!Number.isFinite(time) ||
			time <= previousTime ||
			!Number.isSafeInteger(sample.pv) ||
			sample.pv < previousCount ||
			sample.pv < 0
		)
			throw new Error("Invalid samples");
		previousTime = time;
		previousCount = sample.pv;
	}
	return data;
}
export function trafficWindow(
	history: TrafficHistory,
	hours: number,
): TrafficWindow {
	const latest = history.samples[history.samples.length - 1];
	const end = Date.parse(latest.at);
	const cutoff = end - hours * 3600_000;
	// Use the first observed value inside the window. Never interpolate unseen visits.
	const samples = history.samples.filter(
		(sample) => Date.parse(sample.at) >= cutoff,
	);
	const coveredHours = (end - Date.parse(samples[0].at)) / 3600_000;
	let maxGapHours = 0;
	for (let i = 1; i < samples.length; i++)
		maxGapHours = Math.max(
			maxGapHours,
			(Date.parse(samples[i].at) - Date.parse(samples[i - 1].at)) / 3600_000,
		);
	return {
		samples,
		views: samples.length < 2 ? null : latest.pv - samples[0].pv,
		coveredHours,
		partial: Date.parse(history.startedAt) > cutoff || coveredHours < hours - 2,
		maxGapHours,
	};
}

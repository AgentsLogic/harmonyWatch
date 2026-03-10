"use client";

import { useEffect } from "react";

export function BuildInfo() {
	useEffect(() => {
		const buildHash = process.env.NEXT_PUBLIC_BUILD_HASH || "unknown";
		const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || "unknown";
		
		console.log(
			`%c[HarmonyWatch] Build Info`,
			"color: #4CAF50; font-weight: bold; font-size: 14px;"
		);
		console.log(`%cBuild Hash: ${buildHash}`, "color: #2196F3;");
		console.log(`%cBuild Time: ${buildTime}`, "color: #2196F3;");
		console.log(`%cEnvironment: ${process.env.NODE_ENV}`, "color: #FF9800;");
	}, []);

	return null;
}


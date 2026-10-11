#!/usr/bin/env php
<?php

/*
 * Test stub standing in for Laravel Pint (`php vendor/bin/pint <file>`). The PostToolUse tests
 * copy it to a temporary project's vendor/bin/pint; the hook runs it with php, as it runs the
 * proxy script Composer writes there.
 *
 * Like Pint under an AI agent, it always prints one line of agent-mode JSON, whose "result" the
 * hook must not read: only the exit code counts. It "formats" the file in place (trailing
 * whitespace removed, `array()` turned into `[]`). The file drives it:
 *
 *   STUB:pint-fail   exit 1
 *   STUB:pint-hang   never ends
 *
 * With HOOK_STUB_LOG set, each run appends one JSON line: tool, argv, cwd, pid and the
 * environment variables the hook sets for tools.
 */

$args = array_slice($argv, 1);
$file = end($args);
$source = file_get_contents($file);

$log = getenv('HOOK_STUB_LOG');
if ($log !== false && $log !== '') {
    $env = [];
    foreach (['PAO_DISABLE', 'NO_COLOR', 'FORCE_COLOR', 'npm_config_update_notifier', 'COREPACK_ENABLE_NETWORK', 'COREPACK_ENABLE_DOWNLOAD_PROMPT', 'NEXT_TELEMETRY_DISABLED'] as $name) {
        $value = getenv($name);
        $env[$name] = $value === false ? null : $value;
    }
    $line = ['tool' => 'pint', 'argv' => $args, 'cwd' => getcwd(), 'pid' => getmypid(), 'env' => $env];
    file_put_contents($log, json_encode($line, JSON_UNESCAPED_SLASHES)."\n", FILE_APPEND);
}

echo json_encode(['tool' => 'pint', 'result' => 'fail', 'files' => [$file]], JSON_UNESCAPED_SLASHES)."\n";

if (str_contains($source, 'STUB:pint-hang')) {
    while (true) {
        sleep(1);
    }
}
if (str_contains($source, 'STUB:pint-fail')) {
    exit(1);
}

$formatted = str_replace('array()', '[]', preg_replace('/[ \t]+$/m', '', $source));
if ($formatted !== $source) {
    file_put_contents($file, $formatted);
}
exit(0);

#!/usr/bin/env php
<?php

/*
 * Test stub standing in for PHPStan (`php vendor/bin/phpstan analyse --error-format=json
 * --no-progress <file>`). The PostToolUse tests copy it to a temporary project's
 * vendor/bin/phpstan; the hook runs it with php.
 *
 * It prints a report in PHPStan's JSON format and exits like PHPStan: 0 no errors, 1 errors.
 * PHP encodes an empty "files" map as [], exactly as the real report does. The file drives it:
 *
 *   phpstan-error <identifier> <message>   an error on that line
 *   STUB:phpstan-general                   an error that belongs to no file, exit 1
 *   STUB:phpstan-crash                     a PHP fatal error on stderr, exit 255
 *   STUB:phpstan-hang                      never ends
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
    $line = ['tool' => 'phpstan', 'argv' => $args, 'cwd' => getcwd(), 'pid' => getmypid(), 'env' => $env];
    file_put_contents($log, json_encode($line, JSON_UNESCAPED_SLASHES)."\n", FILE_APPEND);
}

fwrite(STDERR, 'Note: Using configuration file '.getcwd()."/phpstan.neon.\n");

if (str_contains($source, 'STUB:phpstan-hang')) {
    while (true) {
        sleep(1);
    }
}
if (str_contains($source, 'STUB:phpstan-crash')) {
    fwrite(STDERR, "PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes)\n");
    exit(255);
}

$messages = [];
foreach (explode("\n", $source) as $index => $text) {
    if (preg_match('/phpstan-error (\S+) (.+)$/', $text, $match) === 1) {
        $messages[] = ['message' => trim($match[2]), 'line' => $index + 1, 'ignorable' => true, 'identifier' => $match[1]];
    }
}

$general = str_contains($source, 'STUB:phpstan-general')
    ? ['Ignored error pattern #^Access to an undefined property# was not matched in reported errors.']
    : [];

$files = [];
if (count($messages) > 0) {
    $files[realpath($file)] = ['errors' => count($messages), 'messages' => $messages];
}
$report = [
    'totals' => ['errors' => count($general), 'file_errors' => count($messages)],
    'files' => $files,
    'errors' => $general,
];
echo json_encode($report, JSON_UNESCAPED_SLASHES);
exit(count($messages) > 0 || count($general) > 0 ? 1 : 0);

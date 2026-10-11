<?php

// Stand-in for a project's fast check (the Composer side) in the Stop hook tests. It reads every
// file under src/ (recursively) and exits 1 when a file contains the marker LINT_ERROR.
//
// STOP_TEST_LOG (optional): append "composer <directory name>" for each run, to count runs.

$log = getenv('STOP_TEST_LOG');
if (is_string($log) && $log !== '') {
    file_put_contents($log, 'composer '.basename(getcwd())."\n", FILE_APPEND);
}

$root = getcwd().DIRECTORY_SEPARATOR.'src';
$problems = [];
if (is_dir($root)) {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) {
        if ($file->isFile() && str_contains((string) file_get_contents($file->getPathname()), 'LINT_ERROR')) {
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($file->getPathname(), strlen(getcwd()) + 1));
            $problems[] = $relative.':1 fake/no-lint-error LINT_ERROR marker found';
        }
    }
}
sort($problems);
foreach ($problems as $problem) {
    fwrite(STDERR, $problem.PHP_EOL);
}
echo $problems === [] ? "composer fast check passed\n" : count($problems)." problem(s)\n";
exit($problems === [] ? 0 : 1);

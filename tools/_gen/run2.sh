#!/bin/bash
cd "$(dirname "$0")"
run(){ d=$1; (cd $d && cat prompt.txt | codex exec -s workspace-write -i ../../icon-refs/ref-court.png -i ../../icon-refs/ref-summary.png - > ../../.codex-$d.log 2>&1; echo done $d >> ../../.codex-all.log); }
export -f run
printf '%s\n' g-panel g-ribbon g-plate g-tile g-ghost g-key | xargs -P 3 -I{} bash -c 'run {}'

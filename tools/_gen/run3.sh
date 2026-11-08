#!/bin/bash
cd "$(dirname "$0")"
run(){ d=$1; (cd $d && cat prompt.txt | codex exec -s workspace-write -i ../../icon-refs/ref-court.png -i ../../icon-refs/ref-summary.png - > ../../.codex-$d.log 2>&1; echo done $d >> ../../.codex-all.log); }
export -f run
printf '%s\n' g2-panel g2-ribbon s7 s8 s11 s12 s9 s10 g2-plate g2-tile g2-ghost | xargs -P 4 -I{} bash -c 'run {}'

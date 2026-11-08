#!/bin/bash
cd "$(dirname "$0")"
run(){ d=$1; (cd $d && cat prompt.txt | codex exec -s workspace-write -i ../../icon-refs/ref-court.png -i ../../icon-refs/ref-summary.png - > ../../.codex-$d.log 2>&1; echo done $d >> ../../.codex-all.log); }
export -f run
printf '%s\n' s1 s2 s3 s4 s5 s6 f-panel f-bubble f-ribbon f-yes f-no f-gold f-wood f-ghost f-plate f-tile | xargs -P 4 -I{} bash -c 'run {}'

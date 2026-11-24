# Why caches matter

## hook
[#q] Why do apps feel fast even when the database is far away? A cache keeps hot answers close to the request.

## latency
[#ms] A cache hit can answer in about {2|two} milliseconds. That is far cheaper than a round trip to disk or another region.

## compare
[#cold] Without a cache, every request pays full database cost. [#hot] With a cache, repeats reuse a local copy.

## mix
[#hits] Hits stay cheap. [#miss] Misses fall back to the database. [#ratio] The hit rate decides your average cost.

## path
[#ask] A request asks the cache first. [#serve] On a hit it returns immediately. [#fetch] On a miss it fetches, stores, then answers.

## close {hold=1.0}
[#end] Keep hot data near the user, and most traffic never wakes the database.

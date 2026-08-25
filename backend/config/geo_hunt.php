<?php

return [
    'map_root' => env('GEO_HUNT_MAP_ROOT', base_path('../map')),
    'map_cache_store' => env('GEO_HUNT_MAP_CACHE_STORE', 'file'),
    'starting_hp' => 6000,
    'round_seconds' => 90,
    'guess_countdown_seconds' => 30,
    'reveal_seconds' => 8,
    'presence_grace_seconds' => 30,
];

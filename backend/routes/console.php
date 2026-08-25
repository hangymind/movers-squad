<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use App\Services\GeoHuntMapService;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('geo-hunt:warm-cache', function (GeoHuntMapService $maps): void {
    $keys = $maps->keys();
    $bytes = 0;
    foreach ($keys as $key) {
        $bytes += $maps->clientDocument($key)['bytes'];
    }
    $this->info(sprintf('Warmed %d Geo Hunt maps (%s compact JSON).', count($keys), number_format($bytes).' bytes'));
})->purpose('Validate Geo Hunt maps and warm their file cache');

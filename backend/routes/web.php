<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => 'Movers Squad API',
        'status' => 'ok',
    ]);
});

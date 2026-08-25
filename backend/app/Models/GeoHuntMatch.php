<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GeoHuntMatch extends Model
{
    protected $fillable = ['status', 'mode', 'round_number', 'state_version', 'winner_id', 'host_id', 'room_code', 'room_name', 'max_players', 'ended_reason', 'finished_at', 'closed_at', 'xp_awarded_at'];

    protected function casts(): array
    {
        return ['round_number' => 'integer', 'state_version' => 'integer', 'max_players' => 'integer', 'finished_at' => 'datetime', 'closed_at' => 'datetime', 'xp_awarded_at' => 'datetime'];
    }

    public function players(): HasMany
    {
        return $this->hasMany(GeoHuntMatchPlayer::class, 'match_id');
    }

    public function rounds(): HasMany
    {
        return $this->hasMany(GeoHuntRound::class, 'match_id');
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'winner_id');
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }
}

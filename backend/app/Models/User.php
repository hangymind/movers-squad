<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'username',
        'florr_id',
        'level',
        'florr_verified_at',
        'avatar_url',
        'password',
        'is_admin',
        'banned_at',
        'ban_id',
        'show_join_notifications',
        'show_team_created_notifications',
        'show_member_left_notifications',
        'notification_sound_enabled',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'level' => 'integer',
            'is_admin' => 'boolean',
            'florr_verified_at' => 'datetime',
            'banned_at' => 'datetime',
            'show_join_notifications' => 'boolean',
            'show_team_created_notifications' => 'boolean',
            'show_member_left_notifications' => 'boolean',
            'notification_sound_enabled' => 'boolean',
        ];
    }

    public function ownedTeams(): HasMany
    {
        return $this->hasMany(Team::class, 'owner_id');
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_members')
            ->withPivot(['joined_at', 'last_read_message_id']);
    }

    public function florrBindingApplications(): HasMany
    {
        return $this->hasMany(FlorrBindingApplication::class);
    }

    public function publicMessages(): HasMany
    {
        return $this->hasMany(PublicMessage::class);
    }

    public function latestFlorrBinding(): HasOne
    {
        return $this->hasOne(FlorrBindingApplication::class)->latestOfMany();
    }

    public function geoHuntProfile(): HasOne
    {
        return $this->hasOne(GeoHuntProfile::class);
    }
}

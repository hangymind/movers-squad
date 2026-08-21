<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'username' => fake()->unique()->userName(),
            'florr_id' => (string) fake()->unique()->numberBetween(100000, 99999999),
            'level' => fake()->numberBetween(1, 50),
            'avatar_url' => fake()->optional()->imageUrl(128, 128),
            'password' => static::$password ??= Hash::make('password'),
        ];
    }
}

## Projectile — straight-line travel + collision check against `enemies` group.
##
## Spawned by AbilityQBolt. Call `launch(dir, speed, max_range, damage, radius)`
## once after instancing; the projectile manages itself from there.
class_name Projectile
extends Area2D

var _dir: Vector2 = Vector2.RIGHT
var _speed: float = 500.0
var _life_remaining: float = 1.0
var _damage: float = 30.0
var _hit_radius: float = 16.0
var _hit_enemies: Array[Node] = []

func launch(dir: Vector2, speed: float, max_range: float, damage: float, hit_radius: float) -> void:
    _dir = dir.normalized()
    _speed = speed
    _life_remaining = max_range / speed if speed > 0.0 else 0.5
    _damage = damage
    _hit_radius = hit_radius

func _physics_process(delta: float) -> void:
    if _life_remaining <= 0.0:
        queue_free()
        return
    _life_remaining -= delta
    global_position += _dir * _speed * delta
    _check_hits()

func _check_hits() -> void:
    for enemy in get_tree().get_nodes_in_group("enemies"):
        if enemy in _hit_enemies or not enemy is Node2D:
            continue
        if global_position.distance_squared_to((enemy as Node2D).global_position) <= _hit_radius * _hit_radius:
            if enemy.has_method("take_damage"):
                enemy.take_damage(_damage, self)
            _hit_enemies.append(enemy)
            queue_free()
            return

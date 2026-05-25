## CameraFollow — keeps the Camera2D centered on the arena's player hero.
##
## Pulls the player ref from Arena (set in inspector via `arena_node_path`).
## Falls back gracefully if the player isn't ready yet (Arena's _ready may
## fire after Camera's _ready depending on tree order).
extends Camera2D

@export var arena_node_path: NodePath

var _player: Node2D = null

func _ready() -> void:
	# Defer one frame so Arena has time to spawn its heroes
	call_deferred("_acquire_player")

func _acquire_player() -> void:
	var arena: Node = get_node_or_null(arena_node_path)
	if arena and arena.has_method("get_player"):
		_player = arena.get_player()

func _process(_delta: float) -> void:
	if _player == null:
		_acquire_player()
		return
	if not is_instance_valid(_player):
		_player = null
		return
	global_position = _player.global_position

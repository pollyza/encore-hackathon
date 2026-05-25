## Screenshot helper for the Godot project. Loads a scene, waits N seconds,
## saves the viewport image to a file path, quits.
##
## NOT meant to be added to any committed scene — invoked dynamically by
## scripts/godot-screenshot.sh which builds a temp wrapper scene at run time.
##
## Args via OS.get_cmdline_user_args() (everything after `++`):
##   --scene <res://path/to/scene.tscn>   (required)
##   --out <path/on/disk>                 (default /tmp/encore_godot_frame.png)
##   --wait <seconds>                     (default 1.5)
extends Node

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var scene_path := ""
	var out_path := "/tmp/encore_godot_frame.png"
	var wait_secs := 1.5
	var i := 0
	while i < args.size():
		match args[i]:
			"--scene":
				if i + 1 < args.size():
					scene_path = args[i + 1]
					i += 1
			"--out":
				if i + 1 < args.size():
					out_path = args[i + 1]
					i += 1
			"--wait":
				if i + 1 < args.size():
					wait_secs = float(args[i + 1])
					i += 1
		i += 1

	if scene_path == "":
		printerr("[screenshot] missing --scene <res://...> arg")
		get_tree().quit(2)
		return

	var packed: PackedScene = load(scene_path)
	if packed == null:
		printerr("[screenshot] failed to load scene: ", scene_path)
		get_tree().quit(3)
		return

	add_child(packed.instantiate())
	await get_tree().create_timer(wait_secs).timeout

	var img := get_viewport().get_texture().get_image()
	var err := img.save_png(out_path)
	if err != OK:
		printerr("[screenshot] save_png err=", err, " path=", out_path)
		get_tree().quit(4)
		return
	print("[screenshot] saved ", out_path, " (", img.get_width(), "x", img.get_height(), ")")
	get_tree().quit(0)

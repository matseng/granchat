from flask import Flask, request, render_template, redirect
from dotenv import load_dotenv
from uuid import uuid1

from twilio.jwt.access_token import AccessToken
from twilio.jwt.access_token.grants import VideoGrant
from flask_socketio import SocketIO
from flask_socketio import send, emit
from flask_socketio import join_room, leave_room

from google.cloud import speech
from speech import ResumableMicrophoneStream


import os
import numpy as np

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials.json"

load_dotenv()

app = Flask(__name__)
socketio = SocketIO(app)

socketio.init_app(app, cors_allowed_origins="*")

@app.route("/")
def index():
	return render_template("create.html")

@app.route("/create", methods=["POST"])
def create():
	room = str(uuid1())
	return room


@app.route("/room", methods=["GET"])
def serve_room():
	room = request.args.get("room", None)
	other_gp = request.args.get("other_gp", True)
	if room is None:
		return "Invalid room", 400

	identity = str(uuid1())

	account_sid = os.getenv("TWILIO_ACCOUNT_SID")
	api_key = os.getenv("TWILIO_API_KEY")
	api_secret = os.getenv("TWILIO_API_SECRET")

	# Create access token with credentials
	token = AccessToken(account_sid, api_key, api_secret, identity=identity)
	print("NEU TOKEN")

	# Create a Video grant and add to token
	video_grant = VideoGrant(room=room)
	token.add_grant(video_grant)

	# Return token info as JSON
	token_str = token.to_jwt().decode("utf-8")
	return render_template("room.html", token=token_str, is_grandparent=other_gp)

recognizers = dict()
rooms = dict()

def create_recognizer(sid, rate):
	recognizers[sid] = None
	client = speech.SpeechClient()
	config = speech.types.RecognitionConfig(
		encoding=speech.enums.RecognitionConfig.AudioEncoding.LINEAR16,
		sample_rate_hertz=rate,
		language_code='en-US',
		enable_automatic_punctuation=True,
		max_alternatives=1)
	streaming_config = speech.types.StreamingRecognitionConfig(
		config=config,
		interim_results=True)

	mic_manager = ResumableMicrophoneStream(rate, 4096)
	mic_manager.client = client
	mic_manager.streaming_config = streaming_config
	mic_manager.socket = request.namespace
	recognizers[sid] = mic_manager

	print("CHONK", sid, rate, mic_manager.chunk_size)
	mic_manager.start()

		   
def teardown_recognizer(sid):
	if recognizers.get(sid) is None:
		return
	recognizers[sid].close()
	del recognizers[sid]

# samples = list()

@socketio.on('disconnect')
def test_disconnect():
	print('Client disconnected', request.sid)
	teardown_recognizer(request.sid)

	# np.array(samples).reshape(-1).tofile("test.raw")

	del rooms[request.sid]

@socketio.on('heartbeat')
def handle_heartbeat(dat):
	room = dat["room"]
	join_room(room)
	rooms[request.sid] = room
	emit("heartbeat", dat, room=room)


@socketio.on('textsize')
def handle_heartbeat(dat):
	emit("textsize", dat, room=rooms[request.sid])



@socketio.on('buffer')
def handle_buffer(buf):
	if request.sid not in recognizers:
		create_recognizer(request.sid, buf["rate"])

	rec = recognizers.get(request.sid, None)
	if rec is None:
		return

	rec.in_progress += buf["buf"]
	if len(rec.in_progress) >= 4096:
		slic = rec.in_progress[:4096]
		rec.in_progress = rec.in_progress[4096:]
		# samples.append(np.frombuffer(slic, dtype=np.int16))
		rec.fill_buffer(slic)
	
	sequences = [[]]
	while not rec.result_queue.empty():
		result = rec.result_queue.get()
		if result["final"]:
			sequences[-1].clear()
			sequences[-1].append(result)
			sequences.append([])
		else:
			sequences[-1].append(result)
	n = sum([len(x) for x in sequences])
	if n > 0:
		print(sequences)
	for s in sequences:
		if len(s) == 0:
			continue
		last = s[-1]
		emit("transcript", last, room=rooms[request.sid])

# https://5131a5257266.ngrok.io


if "ON_SERVER" in os.environ:
	print("ON SERVER!")
	socketio.run(app, port=80, host="0.0.0.0", debug=False)
else:
	socketio.run(app, port=3000, host="0.0.0.0", debug=True)

var socket = io();

const decoded = jwt_decode(token);
const room = decoded.grants.video.room;
const identity = decoded.grants.identity;
const cookie = readCookie(room);

var isGrandparent = true;
if (cookie) {
    isGrandparent = JSON.parse(cookie).isGrandparent;
} else {
    isGrandparent = isServerGrandparent === true || isServerGrandparent === "true";
}

$("#mode").text("GrannyChat - " + (isGrandparent ? "Grandparent" : "Grandchild"));

const placeholderVideoSrc = isGrandparent ? "/static/video/grandchild.mp4" : "/static/video/grandparent.mp4";

socket.on("connect", function() {
    setInterval(function() {
        socket.emit("heartbeat", {
            sender: identity,
            room: decoded.grants.video.room
        });
    }, 1000);
});

var sizes = {
    mine: $("#my-size").val(),
    theirs: $("#their-size").val()
}

function setMySize(size) {
    $("#transcript")[0].style.fontSize = size + "px";
}

function sizesChanged() {
    setMySize(sizes.mine);
    var dat = {};
    if (isGrandparent) {
        dat.grandparent = sizes.mine;
    } else {
        dat.grandparent = sizes.theirs;
    }
    dat.sender = identity;

    socket.emit("textsize", dat);

}

socket.on("textsize", function(dat) {
    if (dat.sender == identity) {
        return;
    }
    var sz = dat.grandparent;
    if (isGrandparent) {
        if (sizes.mine != sz) {
            setMySize(sz);
            $("#my-size").val(sz);
        }
        sizes.mine = sz;
    } else {
        if (sizes.theirs != sz) {
            $("#their-size").val(sz);
        }
        sizes.theirs = sz;
    }
})

$("#my-size").on('input', function() {
    console.log("SLIDE");
    sizes.mine = $(this).val();
    sizesChanged();
})

$("#their-size").on('input', function() {
    sizes.theirs = $(this).val();
    sizesChanged();
});





function playable(video) {
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
}

var statusByIdentity = {};

// function appendAttachment(track, identity) {
// 	if (track.kind == "audio") {
// 		$("#remote-audio")[0].srcObject = new MediaStream([track.mediaStreamTrack]);
// 		// $("#remote-audio")[0].play();
// 	} else if (track.kind == "video") {

// 		var lastStream = new MediaStream([track.mediaStreamTrack]);
// 		statusByIdentity[identity] = lastStream;

// 		if (identity == lastIdentity) {
// 			$("#remote")[0].srcObject = lastStream;
// 			$("#remote")[0].play();
// 		}
// 		// $("#remote")[0].play();

// 	}	// attachment.classList.add("flipped-video");
// 	// attachment.classList.add(local ? "local-video" : "remote-video");
// 	// document.getElementById("remote-media").appendChild(attachment);
// }


function initId(id) {
    if (!(id in statusByIdentity)) {
        statusByIdentity[id] = {
            lastBeat: 0
        };
    }
}

function attachTracks(participant) {
    const id = participant.identity;
    initId(id);


    function addAttachment(track) {
        var status = statusByIdentity[id];

        if (track.kind == "audio") {
            var stream = new MediaStream([track.mediaStreamTrack]);
            status.audio = stream;
            // $("#remote-audio")[0].play();
        } else if (track.kind == "video") {
            var stream = new MediaStream([track.mediaStreamTrack]);
            status.video = stream;
        }

        // onStatusChange(id);
    }


    participant.tracks.forEach(publication => {
        if (publication.trackSubscribed) {
            addAttachment(publication.track);
        }
    });

    participant.on("trackSubscribed", track => {
        addAttachment(track);
    });

}

socket.on("heartbeat", function(dat) {
    if (dat.sender != identity) {
        const id = dat.sender;
        initId(id);
        statusByIdentity[id].lastBeat = Date.now();
    }
})

var lastSet = null;
setInterval(function() {
    var vid = $("#remote")[0];
    var audio = $("#remote-audio")[0];
    var foundKey = null;
    for (var key in statusByIdentity) {
        var status = statusByIdentity[key];
        if (!status.video || !status.audio) {
            continue;
        }
        var timeSinceLastBeat = Date.now() - status.lastBeat;
        const timeout = 5 * 1000;
        if (timeSinceLastBeat > timeout) {
            continue;
        }
        foundKey = key;
        break;
    }

    if (foundKey) {
        if (foundKey != lastSet) {
            lastSet = foundKey;
            vid.srcObject = statusByIdentity[key].video;
            audio.srcObject = statusByIdentity[key].audio;
        }
    } else {
        if (vid.srcObject) {
            vid.srcObject = null;
            vid.src = placeholderVideoSrc;
        }
        if (audio.srcObject) {
            audio.srcObject = null;
        }
        lastSet = null;
    }


}, 100);



function onJoin(room) {
    console.log(`Successfully joined a Room: ${room}`);


    // Log your Client"s LocalParticipant in the Room
    const localParticipant = room.localParticipant;
    console.log(`Connected to the Room as LocalParticipant "${localParticipant.identity}"`);

    // Attach the Participant"s Media to a <div> element.
    room.on("participantConnected", participant => {
        attachTracks(participant);

    });

    room.participants.forEach(participant => {
        attachTracks(participant);
    });

}

playable($("#remote")[0]);
$("#remote").attr("src", placeholderVideoSrc);


$("#join-button").click(function() {
    // $("#remote")[0].play();
    $("#join").addClass("hidden");
    $("#transcript-container").removeClass("hidden");
    if (!isGrandparent) {
        $("#grandparent-control").removeClass("hidden");

    }

    Twilio.Video.createLocalTracks({
        audio: true,
        video: {
            width: 640
        }
    }).then(function(localTracks) {
        socket.on("transcript", function(data) {
            console.log(data);
            var li = $("#transcript > li").last();
            li.text(data.text);
            if (data.final) {
                $("#transcript").append("<li></li>");
            }
        });


        localTracks.forEach(track => {
            if (track.kind == "video") {
                playable($("#local")[0]);
                $("#local")[0].controls = false;
                $("#local")[0].srcObject = new MediaStream([track.mediaStreamTrack]);
                // $("#local")[0].play();
                $(".video-container").removeClass("hidden");

            }
            if (track.kind == "audio") {
                console.log(track.mediaStreamTrack);
                const stream = new MediaStream([track.mediaStreamTrack]);

                if (window.AudioContext === undefined && window.webkitAudioContext !== undefined) {
                    console.log("REDEFINING");
                    window.AudioContext = window.webkitAudioContext;
                }
                const bufSize = 4096;
                const context = new AudioContext();
                const source = context.createMediaStreamSource(stream);
                const processor = context.createScriptProcessor(bufSize, 1, 1)
                const rate = context.sampleRate;
                const res = new Resampler(rate, 16000, 1, bufSize);

                var bigBuf = new Int16Array(bufSize);
                var bigBufOffset = 0;

                processor.onaudioprocess = (event) => {
                    // const right = event.inputBuffer.getChannelData(1);
                    const outBuf = res.resample(event.inputBuffer.getChannelData(0));
                    const bit16 = floatTo16BitPCM(outBuf);
                    const n = bit16.length;

                    if (!isGrandparent) {
                        socket.emit("buffer", {
                            buf: bit16.buffer,
                            rate: 16000
                        });
                    }



                }


                source.connect(processor);
                processor.connect(context.destination);
            }
        });


        return Twilio.Video.connect(token, {
            name: room,
            tracks: localTracks
        });
    }).then(room => {
        window.globalRoom = room;
        onJoin(room)
    }, error => {
        console.error(`Unable to connect to Room: ${error.message}`);
    });
})
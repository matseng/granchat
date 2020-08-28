$("#create").click(function (e) {
  e.preventDefault();

  $("#create").val("Creating...");
  $("#create").prop("disabled", true);

  const isGrandparent = $("#select-choice").val() == "grandparent";
  const url = "/create?grandparent=" + isGrandparent;

  const start = "My private room link (both for me and my ";
  const middle = isGrandparent ? "grandchild" : "grandparent";
  const end = "):";
  $("#leg").text(start + middle + end);

  var jqxhr = $.post(url)
    .done(function (room) {
      var cookieData = JSON.stringify({ isGrandparent: isGrandparent });
      createCookie(room, cookieData);

      const roomUrl =
        location.origin + "/room?room=" + room + "&other_gp=" + !isGrandparent;
      const link = $("#room-link");
      link.text(roomUrl);
      link.val(roomUrl);
      $("#creation").fadeOut(400, function () {
        $("#result").fadeIn();
      });
    })
    .fail(function () {
      alert("error");
    });
});

$("h1").click(function () {
  window.location = "/";
});

$(".copy-to-clipboard").click(function (e) {
  e.preventDefault();
  const url = $("#room-link").val();
  copyToClipboard(url);
  $(".copy-to-clipboard").val("Copied!");
});

$(".open-new-tab").click(function (e) {
  e.preventDefault();
  const url = $("#room-link").val();
  window.open(url, "_blank");
});

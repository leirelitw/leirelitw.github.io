

var scrollToElement = function(el, ms){
    var speed = (ms) ? ms : 600;
    $('html,body').animate({
        scrollTop: $(el).offset().top
    }, speed);
}

console.log("outside the function");

$(document).ready(function() {
  console.log("outside the click");

  $('.nav-styles').on('click', function(e) {
    console.log("enters the click");
    e.preventDefault();
    var el = document.getElementById("selling-styles");
    console.log(el);
    scrollToElement(el);
  });

  $(window).scroll(function() {
    var x = $(window).scrollTop();

    if (x >= 42) {
      $("#navbar").fadeIn(300);
    } else {
      $("#navbar").fadeOut(300);
    }

  });
});

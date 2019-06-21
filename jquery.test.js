 

//读输入寄存器

$.ajax({
  url: "/api/read_input_float",
  type: "post",
  headers: {
    authorization: "Bearer 1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2"
  },
  data: {
    dev_id: "P401B2190415058",
    bus_id: 2,
    reg: 4112,
    reg_count: 1
  },
  success: d => console.log(d)
});


//读保持寄存器
$.ajax({
    url: "/api/read_hold_float",
    type: "post",
    headers: {
      authorization: "Bearer 1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2"
    },
    data: {
      dev_id: "P401B2190415058",
      bus_id: 2,
      reg: 4112,
      reg_count: 1
    },
    success: d => console.log(d)
  });

/**
 * 正确:
 *    {
 *      code:0,
 *      data:[....]
 *    }
 * 
 * 异常：
 *    {
 *      code:-1,
 *      msg: 'message description'
 *    }
 */

/** 表达式使用文法如下
 * E -> E1 | E2 | E3 | E4              // 分别代表：表达式，算术，关系，布尔，赋值
 */

/** 算术表达式使用文法如下：
 * E1 -> T + E1 | T - E1 | T           // E1:<算术表达式> T:<项>
 * T -> R1 * T | R1 / T | R1 % T | R1  // R1:<因子>
 * R1 -> (E1) | C | V | F              // C:<常量> V:<变量> F:<函数调用>
 * C -> typenum|typechar                       // typenum:<数值型常量>  typechar:<字符型常量> 
 * V -> typeid                             // typeid:<标识符>
 * F -> typeid(L)                          // L:<实参列表>
 * L -> A | epsilon                    // A:<实参>
 * A -> E | E,A
 */

/** 关系表达式使用文法如下：
 * E2 -> E1OE1                          // O:<关系运算符>：<,>,>=,<=,==,!=
 * O -> > | < | >= | <= | == | !=
 */

/** 布尔表达式使用文法如下：
 * E3 -> B || E3 | B                    // 注意||是运算符，而不是或|, B:<布尔项>
 * B -> R2 && B | R2                    // R2:<布尔因子>
 * R2 -> E1 | E2 | !E3
 */

/** 赋值表达式使用文法如下：
 * E4 -> V E4' | R3 E4'' | E4'' R3
 * E4' -> = E | += E | -= E | *= E | /= E | %= E 
 * R3 -> V | F
 * E4'' -> ++ | --
 */

/***************************** 转换为LL1文法 ********************************/
/** 算术表达式
 * E1 -> T E1'
 * E1' -> + E1 | - E1 | epsilon
 * T -> R1 T'
 * T' -> * T | / T | % T | epsilon
 * R1 -> (E1) | C | V | F 
 * C -> typenum|typechar 
 * V -> typeid
 * F -> typeid(L)
 * L -> A | epsilon
 * A -> E A'
 * A' -> epsilon | ,A
 */

/** 布尔表达式
 * E3 -> B E3'
 * E3' -> || E3 | epsilon
 * B -> R2 B'
 * B' -> && B | epsilon
 * R2 -> E1 | E2 | !E3
 */

// 其他的已经属于LL1文法了


const fs = require('fs');
const { WordRecognition } = require('../WordRecognition/WordRecognition')

// 用来求FIRST集以及FOLLOW集的
class Tool {
  constructor(filePath) {
    this.filePath = filePath;
    this.productions = [];  // 产生式集合
    this.splited = new Map();  // 分词后的产生式映射，
    this.Vt = new Set();
    this.Vn = new Set();
    this.firstSet = new Map();
    this.followSet = new Map();
    this.prevFollowSize = [];
    // 记录某非终结符是否可以推出epsilon
    this.epsilonMap = new Map();
    // 定义一些正则表达式 
    this.patternVN = /[A-Z][0-9]*\'*/g;
    this.patternVT = /[a-z]+|(\|\|)|(>=)|(<=)|(==)|(!=)|(\&\&)|(\+=)|(-=)|(\*=)|(\/=)|(%=)|(\+\+)|(--)|[\-\*\/%\(\),\+=!]/g;
    // 注意这里不仅仅是上两的拼接，还加入了“|”
    this.patternAll = /[A-Z][0-9]*\'*|[a-z]+|(\|\|)|(>=)|(<=)|(==)|(!=)|(\&\&)|(\+=)|(-=)|(\*=)|(\/=)|(%=)|(\+\+)|(--)|[\-\*\/%\(\),\+=!]/g;
  }
  processFile() {  // 读入文件
    let _this = this;
    return new Promise((resolve, reject) => {
      fs.readFile(this.filePath, 'utf8', (err, res) => {
        // 需要注意这里还是一个异步操作,封装一个promise
        if (err) {
          reject(err);
        } else {
          // 将每一行后添加一个空格，方便表示空行
          _this.productions = res.split(/[\r\n]+|\r|\n/g);
          resolve(_this.productions);
        }
      })
    })
  }
  splitOr(s) {   // 按单个|符号划分数组
    let s_ = [];
    let prev = 0, i = 1;
    for (i; i < s.length; i++) {
      // 避免匹配到||
      if (s[i] === '|' && s[i + 1] !== '|' && s[i - 1] !== '|') {
        s_.push(s.slice(prev, i));
        prev = i + 1;
      }
    }
    s_.push(s.slice(prev, i));
    return s_
  }
  splitProductions() {  // 分词并找到非终结集以及终结符集
    let ps = this.productions;
    ps.forEach((val, index, arr) => {
      let [front, last] = val.split('->').map(val => val.replace(/ /g, ''));
      // let last_ = last.split(/[^\|]\|[^\|]/);  // 单个|而非两个||  // ! 这个分词有问题，把前后的字符给占了；
      if (last === undefined) debugger
      let last_ = this.splitOr(last);
      let res = [];
      last_.forEach((val) => {
        let resOne = val.match(this.patternAll) || [];
        resOne.length && res.push(resOne);
      })
      // 加入分词映射
      this.splited.set(front, res);

      let resVN = last.match(this.patternVN) || [];
      let resVT = last.match(this.patternVT) || [];
      // 加入终结符集以及非终结符集
      resVN.forEach(val => { this.Vn.add(val) });
      this.Vn.add(front);
      resVT.forEach(val => { this.Vt.add(val) });
    })
  }
  isVn(s) {   // 判断是否是非终结符
    if (!s) return false;
    this.patternVN.lastIndex = 0;
    return this.patternVN.test(s);
  }
  isVt(s) {  // 判断是否是终结符
    if (!s) return false;
    this.patternVT.lastIndex = 0;
    return this.patternVT.test(s);
  }
  can2epsilon(X) {
    // TODO 如果这里栈溢出了，说明是文法产生了循环依赖，之后最好捕获这个异常做出友好的提示
    if (this.isVt(X)) return false;
    if (this.epsilonMap.has(X)) return this.epsilonMap.get(X);
    let res = this.splited.get(X).some((p) => {
      if (p.length === 1 && p[0] === 'epsilon') {
        return true;
      }
      let r = p.every((x) => {
        return this.can2epsilon(x);
      })
      return r;
    })
    this.epsilonMap.set(X, res);
    return res;
  }
  getFirst() {
    for (let [key, val] of this.splited) {
      for (let v of val) {
        this.getFirstOne(v, key);
      }
    }
  }
  getFirstOne(v, key) {  // 单个产生式创建First集(以|符号区分的)
    let id = v.join('');  // 作为First集的键
    let key2v = this.firstSet.get(key);
    if (key2v && key2v.has(id)) return key2v.get(id);
    let items = new Set();  // 将要加入的元素
    // 步骤一&&步骤二
    if (this.isVt(v[0])) {  // 由于我把epsilon也算作终结符了，所以这里是两步作为一步
      items.add(v[0]);
    }// 步骤三 
    else {
      if (!this.firstSet.has(v[0])) {
        for (let v_ of this.splited.get(v[0])) {
          this.getFirstOne(v_, v[0]);
        }
      }
      for (let [i, j] of this.firstSet.get(v[0])) {
        for (let n of j) {
          n !== 'epsilon' && items.add(n);
        }
      }
    }
    // 步骤四 
    if (this.can2epsilon(v[0])) {
      let flag = true;
      // 步骤四-1
      for (let i = 1; i < v.length; i++) {
        if (!this.can2epsilon(v[i])) {
          let res = this.getFirstOne(v.slice(i));
          res.forEach((v) => { items.add(v) });
          flag = false;
          break;
        }
      }
      // 步骤四-2
      if (flag) {
        items.push('epsilon')
      }
    }
    if (key && items.size !== 0) {
      if (this.firstSet.has(key)) {
        this.firstSet.get(key).set(id, items)
      } else {
        this.firstSet.set(key, new Map([[id, items]]));
      }
    }
    // ! first集有循环依赖问题吗
    return items;
  }
  getFollow() {  // 创建Follow集
    this.initFollow();
    do {
      this.getOnceFollow();
    } while (this.isChange())
  }
  initFollow() {
    let i = 0;
    for (let k of this.splited.keys()) {
      if (i === 0) {
        this.followSet.set(k, new Set('#'));
        this.prevFollowSize.push(1);
      } else {
        this.followSet.set(k, new Set());
        this.prevFollowSize.push(0);
      }
      i++;
    }
  }
  isChange() {
    let res = false;
    let i = 0;
    for (let m of this.followSet) {
      if (m.size !== this.prevFollowSize[i]) {
        res = true;
      }
      this.prevFollowSize[i++] = m.size;  // 更新
    }
    return res;
  }
  getOnceFollow() {
    for (let [kF, vF] of this.followSet) {
      for (let [kS, vS] of this.splited) {  // 从上往下找
        for (let arr of vS) {
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] === kF) {
              // 步骤二
              if (this.isVt(arr[i + 1])) {
                vF.add(arr[i + 1])
              } else if (this.isVn(arr[i + 1])) {  // 步骤三
                for (let set of this.firstSet.get(arr[i + 1]).values()) {
                  for (let s of set) {
                    if (s !== 'epsilon') {
                      vF.add(s);
                    }
                  }
                }
              }
              // 步骤四
              if (i === arr.length - 1 ||
                this.multi2epsilon(arr.slice(i + 1))) {
                let addItems = this.followSet.get(kS);
                for (let item of addItems) {
                  vF.add(item);
                }
              }
            }
          }
        }
      }
    }
  }
  multi2epsilon(arr) {
    let res = arr.every((e) => {
      return this.can2epsilon(e);
    })
    return res;
  }
  async init() {
    await this.processFile();
    this.splitProductions();
    this.getFirst();
    this.getFollow();
    // 然后直接使用实例上的属性就可以了
  }
}
/* 使用示范 */
async function example1() {
  const tool = new Tool('C:/My_app/code/j3Complier/src/js/compilerCore/SyntacticParser/Grammar/expression.txt')
  tool.init().then((v) => {
    console.log(tool.followSet);
  })
}
// example1()
// TODO 文法含有回溯，没解决，通过代码解决的E,R1,R2,E4,R3
// TODO 还有同类非终结符需要用终结符归类
class Expression {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.info = [];
    // TODO 把下方的映射单独封装到一个文件中
    this.codeMap = {
      'char': 101, 'int': 102, 'float': 103, 'break': 104,
      'const': 105, 'return': 106, 'void': 107, 'continue': 108,
      'do': 109, 'while': 110, 'if': 111, 'else': 112, 'for': 113,
      'true': 114, 'false': 115, 'double': 116, 'extern': 117, 'unsigned': 118,
      'register': 119, 'long': 120, 'static': 121,
      '{': 301, '}': 302, ';': 303, ',': 304,
      'typeint': 400, 'typechar': 500, 'typestr': 600, 'typeid': 700, 'typenum': 800,
      '(': 201, ')': 202, '[': 203, ']': 204, '!': 205, '*': 206,
      '/': 207, '%': 208, '+': 209, '-': 210, '<': 211, '<=': 212,
      '>': 213, '>=': 214, '==': 215, '!=': 216, '&&': 217, '||': 218,
      '=': 219, '+=': 220, '-=': 221, '*=': 222, '/=': 223, '%=': 224, '++': 225, '--': 226
    };
    this.reCodeMap = {
      '101': 'char', '102': 'int', '103': 'float', '104': 'break',
      '105': 'const', '106': 'return', '107': 'void', '108': 'continue',
      '109': 'do', '110': 'while', '111': 'if', '112': 'else', '113': 'for',
      '114': 'true', '115': 'false', '116': 'double', '117': 'extern', '118': 'unsigned',
      '119': 'register', '120': 'long', '121': 'static',
      '301': '{', '302': '}', '303': ';', '304': ',',
      '400': 'typeint', '500': 'typechar', '600': 'typestr', '700': 'typeid', '800': 'typenum',
      '201': '(', '202': ')', '203': '[', '204': ']', '205': '!', '206': '*',
      '207': '/', '208': '%', '209': '+', '210': '-', '211': '<', '212': '<=',
      '213': '>', '214': '>=', '215': '==', '216': '!=', '217': '&&', '218': '||',
      '219': '=', '220': '+=', '221': '-=', '222': '*=', '223': '/=', '224': '%=', '225': '++', '226': '--'
    }
    this.tool = null;
    this.res = {};
  }
  async init(filePath) {
    console.log('-----------------------------语法分析相关--------------------------------');
    const tool = new Tool(filePath)
    await tool.init();
    this.tool = tool;
  }
  updateToken(tokens) {  // 再次使用这个实例，不过使用不同的tokens
    this.tokens = tokens;
    this.pos = 0;
    this.info = [];  // TODO 最后在总控程序中，每行都要存储一下这个info，不然下次就会将其清除
  }
  testCode() {  // 测试种别码写对没有
    for (let k of Object.keys(this.codeMap)) {
      console.log(k === this.reCodeMap[this.codeMap[k]]);
    }
  }
  isMatch(c) {
    let code = this.codeMap[c];  // 转换为对应token
    if (!code) console.error('文法中非终结符未找到对应种别码');
    let curToken = this.tokens[this.pos];
    if (curToken === code) {
      this.pos++;  // 匹配了就消耗该字符
      return true;
    } else return false;
  }
  isCurInFirst(Xkey, X) {
    let token = this.tokens[this.pos];
    let sym = this.reCodeMap[token];
    if (this.tool.firstSet.get(Xkey).get(X) === undefined) debugger
    return this.tool.firstSet.get(Xkey).get(X).has(sym);
  }
  isCurInFollow(X) {
    if (this.pos >= this.tokens.length) return true;  // 为undefined说明已经消耗完token了，所以匹配epsilon消耗文法也没事；
    let token = this.tokens[this.pos];
    let sym = this.reCodeMap[token];
    return this.tool.followSet.get(X).has(sym);
  }
  hasEpsilon(X) {
    let res = Array.from(this.tool.firstSet.get(X).values()).some((v) => {
      return v.has('epsilon');
    });
    return res;
  }
  backPos(prevPos) {  // 为了在布尔表达式中修改pos值，同时不影响或的结果
    this.pos = prevPos;
    return false;
  }
  // * 如何需要建立语法树的话就需要每次return当前已经建立的树或者false
  E() {
    let prevPos = this.pos;  // ! 几个终结符或起来的不能消耗字符，这里要回去(E,R1,R2需要这样)
    let ctree = null;
    if (this.isCurInFirst('E', 'E1') &&
      (ctree = this.E1() ||  // 错了pos才需要回去
        this.backPos(prevPos))) {
      return { 'E1': ctree };  // 每一层加自身
    } else if (this.isCurInFirst('E', 'E2') &&
      (ctree = this.E2() ||
        this.backPos(prevPos))) {
      return { 'E2': ctree };  // 每一层加自身
    } else if (this.isCurInFirst('E', 'E3') &&
      (ctree = this.E3() ||
        this.backPos(prevPos))) {
      return { 'E3': ctree };  // 每一层加自身
    } else if (this.isCurInFirst('E', 'E4') &&
      (ctree = this.E4() ||
        this.backPos(prevPos))) {
      return { 'E4': ctree };  // 每一层加自身
    } else if (this.hasEpsilon('E') &&
      this.isCurInFollow('E')) {
      // 使用了epsilon  // TODO 不知道使用了epsilon有什么效果，该执行什么。
      // ? 应该是满足调节直接返回true就可以了，不消耗token，消耗文法，使用下一个文法符号
      return 'epsilon';  // 每一层加自身
    } else {
      return false;
    }
  }
  E1() {
    let ctree1 = null, ctree2 = null;
    if ((ctree1 = this.T()) &&
      (ctree2 = this.E1_()))
      return { 'T': ctree1, "E1'": ctree2 };
    else return false;
  }
  E1_() {
    if (this.isMatch('+')) {
      let ctree = this.E1();
      return ctree ? { '+': '+', 'E1': ctree } : false;
    } else if (this.isMatch('-')) {
      let ctree = this.E1();
      return ctree ? { '-': '-', 'E1': ctree } : false;
    } else if (this.isCurInFollow("E1'")) {  // 这里就不用判断是否包含epsilon，因为直接可以判断
      return 'epsilon';
    }
    else {
      this.info.push([this.pos, '期待为+或-'])
      return false
    }
  }
  T() {
    let ctree1 = null, ctree2 = null;
    if ((ctree1 = this.R1()) &&
      (ctree2 = this.T_()))
      return { 'R1': ctree1, "T'": ctree2 };
    else return false;
  }
  T_() {
    if (this.isMatch('*')) {
      let ctree = this.T();
      return ctree ? { '*': '*', 'T': ctree } : false;
    } else if (this.isMatch('/')) {
      let ctree = this.T();
      return ctree ? { '/': '/', 'T': ctree } : false;
    } else if (this.isMatch('%')) {
      let ctree = this.T();
      return ctree ? { '%': '%', 'T': ctree } : false;
    } else if (this.isCurInFollow("T'")) {
      return 'epsilon';
    }
    else {
      this.info.push([this.pos, '期待为*/%'])
      return false;
    }
  }
  R1() {
    let prevPos = this.pos;  // ! 几个终结符或起来的不能消耗字符，这里要回去
    let ctree = null;
    if (this.isMatch('(')) {
      ctree = this.E1();
      return (ctree && this.isMatch(')')) ?
        { '(': '(', 'E1': ctree, ')': ')' } :
        false;
    } else if (this.isCurInFirst('R1', 'C') &&
      (ctree = this.C() ||
        this.backPos(prevPos))) {
      return { 'C': ctree };
    } else if (this.isCurInFirst('R1', 'V') &&
      (ctree = this.V() ||
        this.backPos(prevPos))) {
      return { 'V': ctree };
    } else if (this.isCurInFirst('R1', 'F') &&
      (ctree = this.F() ||
        this.backPos(prevPos))) {
      return { 'F': ctree };
    } else {
      this.info.push([this.pos, '期待为（或CVF对应的非终结符'])
      return false;
    }
  }
  C() {
    // 这种直接非终结符也可以判断是否属于first集，但没必要
    if (this.isMatch('typeint')) {
      return 'typeint';
    } else if (this.isMatch('typechar')) {
      return 'typechar';
    } else {
      this.info.push([this.pos, '期待为数字型常量或字符型常量'])
      return false;
    }
  }
  V() {
    if (this.isMatch('typeid')) {
      return 'typeid';
    } else {
      this.info.push([this.pos, '期待为标识符'])
      return false;
    }
  }
  F() {
    let ctree = null;
    if (this.isMatch('typeid')) {
      return (this.isMatch('(') &&
        (ctree = this.L()) &&
        this.isMatch(')')) ?
        { 'typeid': 'typeid', '(': '(', 'L': ctree, ')': ')' } :
        false;
    } else {
      this.info.push([this.pos, '期待为标识符'])
      return false;
    }
  }
  L() {
    let ctree = null;
    if (ctree = this.A()) {
      return { 'A': ctree };
    } else if (this.isCurInFollow('L')) {
      return 'epsilon';
    } else return false;
  }
  A() {
    let ctree1 = null, ctree2 = null;
    if ((ctree1 = this.E()) && (ctree2 = this.A_())) {
      return { 'E': ctree1, "A'": ctree2 };
    } return false;
  }
  A_() {
    if (this.isMatch(',')) {
      let ctree = this.A();
      return ctree ? { ',': ',', 'A': ctree } : false;
    } else if (this.isCurInFollow("A'")) {
      return 'epsilon';
    }
    else {
      this.info.push([this.pos, '期待为,'])
      return false
    }
  }
  E2() {
    let ctree1 = null, ctree2 = null, ctree3 = null;
    if ((ctree1 = this.E1) && (ctree2 = this.O()) && (ctree3 = this.E1)) {
      return { 'E1': ctree1, 'O': ctree2, 'E1': ctree3 };
    } else return false;
  }
  O() {
    if (this.isMatch('>')) return '>';
    else if (this.isMatch('<')) return '<';
    else if (this.isMatch('>=')) return '>=';
    else if (this.isMatch('<=')) return '<=';
    else if (this.isMatch('==')) return '==';
    else if (this.isMatch('!=')) return '!=';
    else {
      this.info.push([this.pos, '期待为比较符'])
      return false;
    }
  }
  E3() {
    let ctree1 = null, ctree2 = null;
    if ((ctree1 = this.B()) && (ctree2 = this.E3_())) {
      return { 'B': ctree1, "E3'": ctree2 };
    } return false;
  }
  E3_() {
    if (this.isMatch('||')) {
      let ctree = this.E3();
      return ctree ? { '||': '||', 'E3': ctree } : false;
    } else if (this.isCurInFollow("E3'")) {
      return 'epsilon';
    } else {
      this.info.push([this.pos, '期待为||'])
      return false;
    }
  }
  B() {
    let ctree1 = null, ctree2 = null;
    if ((ctree1 = this.R2()) && (ctree2 = this.B_())) {
      return { 'R2': ctree1, "B'": ctree2 };
    } return false;
  }
  B_() {
    if (this.isMatch('&&')) {
      let ctree = this.B();
      return ctree ? { '&&': '&&', 'B': ctree } : false;
    } else if (this.isCurInFollow("B'")) {
      return 'epsilon';
    } else {
      this.info.push([this.pos, '期待为&&'])
      return false;
    }
  }
  R2() {
    let prevPos = this.pos;  // ! 几个终结符或起来的不能消耗字符，这里要回去
    let ctree = null;
    if (this.isCurInFirst('R2', 'E1') &&
      (ctree = this.E1() ||
        this.backPos(prevPos)))
      return { 'E1': ctree };
    else if (this.isCurInFirst('R2', 'E2') &&
      (ctree = this.E2() ||
        this.backPos(prevPos)))
      return { 'E2': ctree };
    else if (this.isMatch('!')) {
      ctree = this.E3();
      return ctree ? { '!': '!', 'E3': ctree } : false;
    } else {
      this.info.push([this.pos, '期待为E1E2或！'])
      return false;
    }
  }
  E4() {
    let prevPos = this.pos;
    let ctree = null;
    if (this.isCurInFirst('E4', "VE4'") &&
      (ctree = this.V() ||
        this.backPos(prevPos))) {
      let ctree_ = this.E4_();
      return ctree_ ? { 'V': ctree, "E4'": ctree_ } : false;
    }
    else if (this.isCurInFirst('E4', "R3E4''") &&
      (ctree = this.R3() ||
        this.backPos(prevPos))) {
      let ctree_ = this.E4__();
      return ctree_ ? { 'R3': ctree, "E4''": ctree_ } : false;
    }
    else if (this.isCurInFirst('E4', "E4''R3") &&
      (ctree = this.E4__() ||
        this.backPos(prevPos))) {
      let ctree_ = this.R3();
      return ctree_ ? { "E4''": ctree, 'R3': ctree_ } : false;
    }
    else return false;
  }
  E4_() {
    // TODO 这里(这类)明显冗余了，后续需要优化
    if (this.isMatch('=')) {
      let ctree = this.E();
      return ctree ? { '=': '=', 'E': ctree } : false;
    } else if (this.isMatch('+=')) {
      let ctree = this.E();
      return ctree ? { '+=': '+=', 'E': ctree } : false;
    } else if (this.isMatch('-=')) {
      let ctree = this.E();
      return ctree ? { '-=': '-=', 'E': ctree } : false;
    } else if (this.isMatch('*=')) {
      let ctree = this.E();
      return ctree ? { '*=': '*=', 'E': ctree } : false;
    } else if (this.isMatch('/=')) {
      let ctree = this.E();
      return ctree ? { '/=': '/=', 'E': ctree } : false;
    } else if (this.isMatch('%=')) {
      let ctree = this.E();
      return ctree ? { '%=': '%=', 'E': ctree } : false;
    } else return false
  }
  R3() {
    let prevPos = this.pos;
    let ctree = null;
    if (this.isCurInFirst('R3', 'V') &&
      (ctree = this.V() ||
        this.backPos(prevPos)))
      return { 'V': ctree };
    else if (this.isCurInFirst('R3', 'F') &&
      (ctree = this.F() ||
        this.backPos(prevPos)))
      return { 'F': ctree };
    else return false;
  }
  E4__() {
    if (this.isMatch('++')) return '++';
    else if (this.isMatch('--')) return '--';
    else {
      this.info.push([this.pos, '期待为++或--']);
      return false;
    }
  }
}
function printTree(tree, op = 1) {
  for (let [k, v] of Object.entries(tree)) {
    console.log('-'.repeat(op) + k);
    if (typeof v !== 'object') {
      console.log('-'.repeat(op + 1) + v);
    } else {
      printTree(v, op + 1);
    }
  }
}

/* 使用示范 */
async function example2() {
  const wr = new WordRecognition('C:/My_app/code/j3Complier/src/js/compilerCore/testCase/语法分析用例.txt');
  let [wInfo, error, tokensArr] = await wr.start();
  const exp = new Expression([]);
  await exp.init('C:/My_app/code/j3Complier/src/js/compilerCore/SyntacticParser/Grammar/expression.txt')
  console.log('*'.repeat(20)+'first集'+'*'.repeat(20));
  console.log(exp.tool.firstSet);
  console.log('*'.repeat(20)+'follow集'+'*'.repeat(20));
  console.log(exp.tool.followSet);
  let sInfo = {};
  for(let [line,tokens] of Object.entries(tokensArr)){
    exp.updateToken(tokens)
    let res = exp.E();
    exp.info.length && (sInfo[line] = exp.info); // 收集日志信息
    if(res){
      console.log('*'.repeat(20)+`第${Number(line)+1}行语句`+'*'.repeat(20));
      console.log(tokens);
      printTree(res);
    }
  }
  console.log('*'.repeat(20)+'语法分析日志信息'+'*'.repeat(20));
  console.log(sInfo);
}
example2();


// ? ';'代表是这句的结尾，需要进行判断，或者需要将;加入到种别码表中

/** 常量、变量、函数声明的文法
 * S -> D | E  // S:<语句>, D:<声明语句>，E:<执行语句>
 * D -> V | F |epsilon // V:<值声明>，F:<函数声明>
 * V -> C | B  // C:<常量声明>，B:<变量声明>
 * C -> const G T  // G:<常量类型>，T:<常量声明表>
 * G -> int|char|float
 * T -> typeid=H;|typeid=H,T  // H:<常量>
 * H -> typenum | typestr
 * B -> I J  // I:<变量类型>，J:<变量声明表>
 * J -> K;|K,J  // K:<单变量声明>
 * K -> typeid | typeid=L  // L:<表达式>
 * I -> int|char|float
 * F -> M typeid(N)  // M:<函数类型>，N:<函数声明形参列表>
 * M -> int|char|float|void
 * N -> P | epsilon  // P:<函数声明形参>
 * P -> I|I,P  // 它这里规定了函数声明的形参列表只声明形参的类型，不声明变量，以示和函数定义区分
 */

/** 函数定义
 * F -> M typeid (L) // ! <复合语句>  // M: 函数类型, F: 函数定义, L: 函数形参列表
 * M -> int|char|float|void
 * L -> D | epsilon   // D: 函数定义形参
 * D -> I typeid|I typeid,D  // I: 变量类型
 * I -> int|char|float
 */

/** 执行语句文法
 * E -> D | C | A   // E: 执行语句, D: 数据处理语句, C: 控制语句, A: 复合语句
 * D -> B | F  // B: 赋值语句, F: 函数调用语句
 * B -> G  // G: 赋值表达式
 * F -> H  // 函数调用
 * C -> I | O | W | W1 | R  // I: if语句, O: for语句, W: while语句, W1: dowhile语句, R: return语句
 * A -> { J }  // J: 语句表
 * TODO J -> <语句> | <语句> J  
 *+‘ 
 * I -> if (<表达式>)K | if(<表达式>)K else K
 * O -> for (<表达式>;<表达式>;<表达式>)L  // L: 循环语句
 * W -> while(<表达式>)L
 * W1 -> do M while(<表达式>); // M: 循环用复合语句
 * L -> <声明语句> | N | M  // N: 循环执行语句
 * M -> { P } // P: 循环语句表
 * P -> L | L P
 * N -> Q | O | W | W1 | R | T | U   // Q: 循环用if语句, T: break语句, U: continue语句
 * Q -> if(<表达式>)L | if(<表达式>)L else L
 * R -> return; | return <表达式>;
 * T -> break;
 * U -> continue; 
 */


/** 入口函数
 * C -> S main()<复合语句>B  // B:<函数块>
 * B -> <函数定义><函数块>|epsilon
 */

function ifs(){

}
async function sampleParse(tokensArr){

}
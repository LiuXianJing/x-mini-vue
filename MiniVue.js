// MiniVue是主函数
function MiniVue(options) {
    // options是new MiniVue传入的参数
    this.$el = options.el;
    this.$data = options.data;
    this.$options = options;
    if (this.$el) {
      // 代理数据
      proxyData(this.$data)
      // 数据观察
      new Observer(this.$data);
      // 指令属性解析, 传入挂载的dom节点和MiniVue的实例vm
      new Compile(this.$el, this);
    }
}

// 代理data
function proxyData(data) {
  for(const key in data){
      Object.defineProperty(this, key, {
          get(){
              return data[key];
          },
          set(newVal){
              data[key]=newVal;
          }
      })
  }
}

const compileUtil = {
    setVal(expr, vm, inputVal){
        return expr.split('.').reduce((data,currentVal)=>{
            data[currentVal] = inputVal
        }, vm.$data)
    },

    getVal(expr, vm){
        return expr.split('.').reduce((data, currentVal)=>{
            return data[currentVal]
        }, vm.$data)
    },

    getContentVal(expr, vm){
        return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            return this.getVal(args[1],vm);
        })
    },

    model(node, expr, vm){
        const value = this.getVal(expr, vm);
        // 数据 -> 视图
        new Watcher(vm, expr, (newVal)=>{
            this.update.modelUpdate(node,newVal)
        })
        // 视图 -> 数据 -> 视图
        node.addEventListener('input',(e)=>{
            //设置值
            this.setVal(expr, vm, e.target.value)
        })
        this.update.modelUpdate(node,value);
    },

    on(node,expr,vm,eventName){
        let fn = vm.$options.methods && vm.$options.methods[expr]
        node.addEventListener(eventName, fn.bind(vm), false)
    },

    html(node,expr,vm){
        let value = this.getVal(expr,vm);
        new Watcher(vm,expr,(newVal)=>{
          this.update.htmlUpdate(node,newVal)
        })
        this.update.htmlUpdate(node,value);
    },

    text(node, expr, vm){
        let value;
        if(expr.indexOf('{{') !== -1){
            value = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
                new Watcher(vm,args[1],()=>{
                    this.update.textUpdate(node,this.getContentVal(expr,vm))
                })
                return this.getVal(args[1],vm);
            })
        } else {
            value=this.getVal(expr,vm);
        }
        this.update.textUpdate(node,value)
    },

    // 更新的函数
    update: {
        htmlUpdate(node, value){
          node.innerHTML = value
        },
        textUpdate(node, value){
          node.textContent = value;
        },
        modelUpdate(node, value){
          node.value = value
        },
    }
}

// 数据观察
function Observer(data) {

    Observer.prototype.observe = function(data) {
        if(data && typeof data === 'object'){
            Object.keys(data).forEach(key => {
                this.defineReactive(data, key, data[key])
            })
        }
    }

    Observer.prototype.defineReactive = function(obj, key, value) {
        //递归观察数据
        this.observe(value);
        const dep = new Dep();
        // 劫持监听
        Object.defineProperty(obj, key, {
            enumerable:true,
            configurable:false,
            get(){
                // 订阅, 数据变化时往Dep中添加观察者
                Dep.target && dep.addSub(Dep.target)
                return value;
            },
            set: (newVal)=>{
                this.observe(newVal)
                if(newVal !== value){
                    value=newVal;
                } 
                // 通知dep
                dep.notify()
            }
        })
    }

    this.observe(data)
}

// 订阅器
function Dep() {
  this.subs = [];

  // 收集观察者
  Dep.prototype.addSub = function(watcher) {
      this.subs.push(watcher);
  }

  // 通知观察者更新内容
  Dep.prototype.notify = function() {
      this.subs.forEach( w => w.update())
  }
}

// 观察者Watcher
function Watcher(vm, expr, cb) {
  this.vm = vm;
  this.expr = expr;
  this.cb = cb;

  Watcher.prototype.getOldVal = function() {
      Dep.target = this;
      const oldVal = compileUtil.getVal(this.expr, this.vm);
      Dep.target = null;
      return oldVal;
  }

  Watcher.prototype.update = function() {
      const newVal = compileUtil.getVal(this.expr, this.vm);
      if(newVal !== this.oldVal) {
          this.cb(newVal);
      }
  }

  this.oldVal = this.getOldVal()
}

// 指令属性解析
function Compile(el,vm) {
  this.el = document.querySelector(el);
  this.vm = vm;

  // 获取所有的子孙节点
  Compile.prototype.nodeToFragment = function(el) {
      const f = document.createDocumentFragment();
      let firstChild;
      while(firstChild = el.firstChild){
          f.appendChild(firstChild);
      }
      return f;
  }

  // 编译模板
  Compile.prototype.compile = function(fragment) {
      const childNodes = fragment.childNodes;
      [...childNodes].forEach(child=>{
      if(child.nodeType === 1){ 
          // 元素节点
          this.compileElement(child);
      }else{
          // 文本节点
          this.compileText(child);
      }
      if(child.childNodes && child.childNodes.length){
        this.compile(child);
      }
    })
  };

  // 编译元素节点
  Compile.prototype.compileElement = function(node) {
      const attributes = node.attributes;
      [...attributes].forEach(attr=>{
          const { name, value } = attr;
          if (name.startsWith('v-')) {
              const [_, dirctive] = name.split('-');
              const [ dirName, eventName ] = dirctive.split(':');

              compileUtil[dirName](node, value, this.vm, eventName);
              node.removeAttribute('v-' + dirctive);
          } else if (name.startsWith('@')) {
              let[_ , eventName]= name.split('@');

              compileUtil['on'](node,value,this.vm,eventName);
          }
    })
  }

  // 编译文本节点
  Compile.prototype.compileText = function(node) {
      // 编译{{}}
      const content =node.textContent;
      if (/\{\{(.+?)\}\}/.test(content)) {
          compileUtil['text'](node, content, this.vm)
      }
  }

  const fragment = this.nodeToFragment(this.el);
  this.compile(fragment);
  this.el.appendChild(fragment);
}

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.MiniVue = factory());
  }(this, function () { 
    'use strict';
    return MiniVue;
}))
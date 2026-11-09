# Python 扩展的编译、链接和导入

上层调用是 `import infra_rowdot` 和 `infra_rowdot.dot3(a, b)`。一个扩展模块负责把两个三元素序列解析为 double 数组。独立动态库负责逐项乘加。成功时，两组输出分别是 2.375 和 5.0。

## 复跑

需要 macOS arm64、CPython 3.12 的开发头文件和共享 `libpython3.12.dylib`，以及 Xcode 命令行工具提供的 `clang`、`nm`、`otool`。本次记录来自 CPython 3.12.13 和 Apple clang 17。在解压的目录里运行以下命令，标准库脚本会在临时目录编译，退出后回收文件。

```sh
python3.12 -B extension_loader.py > replay.json
```

脚本为每次导入启动独立 Python 进程，并将模块搜索路径限定为对应测试目录。运行记录包含编译与链接的命令、退出码和诊断，二进制符号及依赖检查结果，还有导入进程返回的结构化观察。记录中的 `<work>`、`<source>`、`<python-include>`、`<python-lib>`、`<python>` 代表当次环境路径。

## 跟着记录定位故障

|阶段|单独改变什么|看哪份证据|
|---|---|---|
|编译|停用默认头文件搜索，且省去 Python 头文件目录|编译器报 `Python.h` 缺失，目标文件未生成|
|链接|保留已编译对象和 Python 库，省去点积动态库|链接器找不到 `_infraguide_rowdot3`，扩展文件未生成|
|搜索文件|只把成功的扩展改名为 `infra_rowdot.foreign-fixture.so`|文件字节相同，`PathFinder` 找不到候选，导入报 `ModuleNotFoundError`|
|装载依赖|保持正确文件名和相同扩展字节，暂时移除旁边的点积动态库|候选存在，dyld 报 `Library not loaded`；`otool -L` 能看到 `@rpath` 依赖名|
|查找初始化符号|用同一 C 源码生成导出 `PyInit_other` 的版本，保持库和文件名正确|`nm -gU` 能看到实际导出，Python 要求 `PyInit_infra_rowdot`，导入报 `ImportError`|
|复查数值|补回缺失的动态库，保留原扩展文件|导入成功，输出恢复为 2.375 和 5.0，两元素输入仍报 `TypeError`|

编译和链接使用显式 Python 库，以便在链接阶段单独隔离缺失的点积符号。某些构建配置允许在导入时再解析符号，诊断阶段要按实际链接参数判断。这里的 `@loader_path` 把 `@rpath` 搜索位置设为扩展所在目录。点积库可以随模块一起部署，恢复试验无需重新编译。符号表中 Mach-O 名称带前导下划线，例如 `_PyInit_infra_rowdot`，C 源码中使用 `PyInit_infra_rowdot`。

实验验证 macOS 下的 CPython 扩展和 CPU 数值路径。Linux ELF、Windows PE 和框架的 GPU 扩展分别有各自的二进制格式、依赖规则与目标设备验收。

- [CPython 3.12 扩展构建与初始化函数](https://docs.python.org/3.12/extending/building.html)
- [CPython 3.12 识别的扩展文件后缀](https://docs.python.org/3.12/library/importlib.html#importlib.machinery.EXTENSION_SUFFIXES)
- [CPython 3.12.13 动态装载实现](https://github.com/python/cpython/blob/v3.12.13/Python/dynload_shlib.c)
- [Apple 动态库的运行时搜索路径](https://developer.apple.com/library/archive/documentation/DeveloperTools/Conceptual/DynamicLibraries/100-Articles/RunpathDependentLibraries.html)
